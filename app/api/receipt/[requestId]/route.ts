import { NextResponse } from 'next/server';
import {
  AGENTS_EXPLORER,
  SOMNIA_PLATFORM_ADDRESS,
  normalizeMinimalReceipt,
  receiptServiceUrl,
  type RawMinimalReceiptResponse,
} from '@/lib-web/agents';

export const dynamic = 'force-dynamic';

// v15: alternate host for the same receipt data. The platform exposes the
// `agent-receipts` endpoint on both `receipts.testnet.agents.somnia.host`
// (the canonical raw API) and `agents.testnet.somnia.network` (the UI host
// that fronts the same data). The two hosts run on different infra, so a
// single-host outage shouldn't break the receipt page. We try the alternate
// host on a 5xx from the primary before returning 502.
// v17 (H2): accept the same `contractAddress` param as the primary
// `receiptServiceUrl` so both URLs target the AutoResolve contract (not the
// platform address).
function alternateReceiptServiceUrl(
  requestId: string,
  type: 'minimal' | 'full' = 'minimal',
  contractAddress: string
): string {
  const url = new URL(`${AGENTS_EXPLORER}/agent-receipts`);
  url.searchParams.set('requestId', requestId);
  url.searchParams.set('contractAddress', contractAddress);
  url.searchParams.set('type', type);
  return url.toString();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;

  if (!requestId || requestId === '0' || !/^\d+$/.test(requestId)) {
    return NextResponse.json({ error: 'Invalid request ID' }, { status: 400 });
  }

  // v17 (H2): the receipt service filters by originating contract. The
  // AutoResolve contract (from NEXT_PUBLIC_CONTRACT_ADDRESS) is the one
  // that called `PLATFORM.createRequest`, so the platform's receipts
  // for those requests are filed under that address. Falling back to
  // the platform address keeps the function callable in dev/test where
  // the env var isn't set, but the production path uses the deployed
  // contract address. v26 (M2): import the platform address from
  // `lib-web/agents.ts` instead of redeclaring the constant locally —
  // SOMNIA_PLATFORM_ADDRESS is the canonical export and re-declaring
  // risks drift if the platform ever moves.
  const contractAddress =
    (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS && process.env.NEXT_PUBLIC_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000')
      ? process.env.NEXT_PUBLIC_CONTRACT_ADDRESS
      : SOMNIA_PLATFORM_ADDRESS;

  const fetchUpstream = (url: string) =>
    fetch(url, {
      headers: { Accept: 'application/json' },
      // Cache for 5s on the server to absorb repeated views of the same receipt
      // (judge deep-links, manual refresh, etc.). The client polls every 5s, so
      // 5s revalidate keeps the UI feeling live while collapsing upstream calls.
      next: { revalidate: 5 },
    });

  // v16 (M4): up to two attempts at the primary host before falling through
  // to the alternate. A 5xx from a single try may be a 200ms blip (gateway
  // reset, LB failover), and burning one extra request cuts the user-visible
  // "platform appears to be down" rate in half on the typical incident.
  // Each attempt is cheap (the upstream is on Somnia's CDN), and the second
  // attempt is gated on the first having returned >= 500 (not 4xx — 4xx is
  // a real client error, not a transient blip).
  const PRIMARY_MAX_ATTEMPTS = 2;

  try {
    let primary: Response | null = null;
    let primaryStatus = 0;
    for (let attempt = 0; attempt < PRIMARY_MAX_ATTEMPTS; attempt++) {
      // v17 (L2): wrap the upstream call in try/catch so a thrown error
      // (DNS resolution failure, connection reset, fetch abort) doesn't
      // short-circuit the retry loop and skip the alternate-host fallback.
      // A thrown error is treated as a transient 599 (outside the standard
      // status range) so the >= 500 branch below still routes to the
      // fallback host. The 4xx short-circuit logic is unchanged — only the
      // thrown-error path is new.
      let res: Response;
      try {
        res = await fetchUpstream(receiptServiceUrl(requestId, 'minimal', contractAddress));
      } catch (err) {
        // v49 (L1): surface the fetch-threw case to operators. Pre-v49,
        // the bare `catch {}` left the dev-server logs empty for a network
        // error on the primary host — operators hitting a 599 had to
        // dig into the network tab to distinguish "platform DNS is
        // down" from "platform rejected our request." Matches the v47
        // (L1) /api/topics console.warn pattern.
        console.warn('[api/receipt] primary host fetch threw:', err);
        primaryStatus = 599;
        continue;
      }
      if (res.ok) {
        primary = res;
        primaryStatus = 200;
        break;
      }
      primaryStatus = res.status;
      // Don't retry 4xx — those are real client errors (404 not-found,
      // 429 throttling), not transient blips. A second attempt on 404
      // wastes an upstream round-trip with no new information.
      if (res.status < 500) {
        primary = res;
        break;
      }
    }

    if (primary && primary.ok) {
      // v19 (M1): wrap normalizeMinimalReceipt in a try/catch so a malformed
      // body (e.g. data.receipts[0] is undefined, or fields are missing)
      // doesn't fall through to the generic 500 with no upstreamStatus.
      // The throw surfaces as a 502 with upstreamStatus:200, which is the
      // honest signal — the platform returned 200, but the body wasn't
      // usable. The hook's status-code logic still routes correctly.
      // v68 (M0): also detect the 200-with-0-receipts case the platform
      // returns when the receipt was filed under a DIFFERENT contract
      // (e.g. the v7 proof receipts 4254170/4254291 are filed under
      // 0xd3E946aC…4B69, but the canonical AutoResolve contract is the
      // v19+v40+v45 address — querying with the current contract returns
      // `{"receipts":[],"count":0}`). Pre-v68, normalizeMinimalReceipt
      // threw on data.receipts[0] being undefined and the route returned
      // 502 with upstreamStatus:200, which the viewer rendered as
      // "couldn't parse, mid-deploy" — misleading because the platform
      // was actually responding, the receipt just lives under a
      // different contract. v68 falls through to a platform-address
      // retry first, and only emits the 502 if the platform itself
      // returns 0 receipts under its own address.
      try {
        const data = (await primary.json()) as RawMinimalReceiptResponse;
        if (!data.receipts || data.receipts.length === 0) {
          // Receipt isn't filed under the queried contract. Try the
          // platform address before giving up — the platform's own
          // address filter does the cross-contract lookup that the
          // contract-filtered query doesn't.
          console.warn(
            `[api/receipt] contract-filtered primary returned 0 receipts for requestId=${requestId} contractAddress=${contractAddress}; retrying under SOMNIA_PLATFORM_ADDRESS`,
          );
          primaryStatus = 404;
          // fall through to the platform-address retry below
        } else {
          const receipt = normalizeMinimalReceipt(data);
          return NextResponse.json(receipt);
        }
      } catch (err) {
        // v49 (L1): surface the normalize-threw case to operators. The
        // platform returned 200, but the body wasn't usable — the 502
        // response with upstreamStatus:200 is the honest signal to the
        // client, but operators reading the dev-server logs get no
        // diagnostic. v34 (H2) added an AgentReceiptViewer branch on
        // upstreamStatus === 200 ("we couldn't parse the response")
        // for the user-facing path; this warn is the operator-facing
        // complement.
        console.warn(`[api/receipt] normalizeMinimalReceipt threw for requestId=${requestId}:`, err);
        primaryStatus = 200;
        // fall through to the 502 branch below
      }
    }

    // v68 (M0): cross-contract receipt recovery. The primary host
    // returned 0 receipts under the AutoResolve contract filter, which
    // happens when a request was filed under a prior contract version
    // (the v7 receipts 4254170/4254291 are filed under
    // 0xd3E946aC…4B69, not the current 0x48556E…85dE). The platform
    // serves those receipts under the SOMNIA_PLATFORM_ADDRESS
    // filter — a one-time retry with that filter surfaces the
    // canonical receipt body. Only reached on the empty-receipts
    // path; a real 404 from the contract-filtered query (the
    // request id genuinely doesn't exist) is still a 404.
    if (primaryStatus === 404 && contractAddress !== SOMNIA_PLATFORM_ADDRESS) {
      try {
        const crossContract = await fetchUpstream(
          receiptServiceUrl(requestId, 'minimal', SOMNIA_PLATFORM_ADDRESS),
        );
        if (crossContract.ok) {
          const crossData = (await crossContract.json()) as RawMinimalReceiptResponse;
          if (crossData.receipts && crossData.receipts.length > 0) {
            return NextResponse.json({
              ...normalizeMinimalReceipt(crossData),
              // Mark cross-contract receipts so the viewer can surface
              // "originally filed under a prior contract version" copy
              // if it ever wants to (currently unused — the receipt
              // data is identical to what a same-contract user would
              // see).
              _source: 'platform',
            });
          }
        }
      } catch (err) {
        // v49 (L1): surface the cross-contract retry throw to operators.
        // Bare `catch {}` would leave the dev-server logs empty when
        // the platform host is network-unreachable on this retry —
        // the operator's only signal would be the 404 to the user.
        console.warn(`[api/receipt] platform-address retry threw for requestId=${requestId}:`, err);
      }
    }

    if (primary && primaryStatus === 404) {
      return NextResponse.json(
        { error: 'Receipt not found', requestId, upstreamStatus: 404 },
        // v26 (L1): tightened from max-age=10. The TanStack Query poll
        // interval in useAgentReceipt is 5s, so a 10s cache meant a user
        // who polled once at the 404 boundary would see the stale "not
        // found" for a second poll after the receipt was actually
        // available. 2s is well below the 5s poll so the user always
        // sees the live state on the next refresh.
        { status: 404, headers: { 'Cache-Control': 'public, max-age=2' } }
      );
    }

    // v15: on a 5xx from the primary host, try the alternate host before
    // giving up. The platform exposes the same `agent-receipts` endpoint on
    // both hosts, so a single-host outage shouldn't break the receipt page.
    // v17 (L2): 599 (sentinel for fetch-threw) falls into this branch so the
    // alternate host still gets a chance on a network error.
    // v19 (M1): also fall through here when normalizeMinimalReceipt threw —
    // the alternate host may serve a well-formed body for the same request.
    if (primaryStatus >= 500 || (primary?.ok && primaryStatus === 200)) {
      try {
        const fallback = await fetchUpstream(
          alternateReceiptServiceUrl(requestId, 'minimal', contractAddress),
        );
        if (fallback.ok) {
          const data = (await fallback.json()) as RawMinimalReceiptResponse;
          return NextResponse.json({
            ...normalizeMinimalReceipt(data),
            _source: 'fallback',
          });
        }
      } catch (err) {
        // v49 (L1): surface the fallback-fetch-threw case to operators.
        // The primary host's normalize threw (or returned 5xx), so we
        // tried the alternate host; if THAT also threw, we fall through
        // to the 502. A bare `catch {}` left the dev-server logs empty
        // for the case where BOTH hosts are network-unreachable —
        // operators had to infer that from the 502 with no diagnostic.
        console.warn(`[api/receipt] fallback host fetch threw for requestId=${requestId}:`, err);
        // Fall through to the 502 below.
      }
    }

    // v14: pass the upstream status through so the client can distinguish
    // "platform is throttling us" (429) from "platform is down" (502/503)
    // from "our gateway broke" (a real 500). The UI uses this to pick the
    // right copy ("retrying…" vs "platform appears to be down"), and the
    // hook uses it to decide whether to back off.
    // v19 (L3): add Cache-Control on the 502 path. A downstream CDN or
    // browser cache that latches onto a 502 can keep returning it after the
    // platform recovers. A 10s max-age caps the staleness while still
    // absorbing judge deep-link bursts.
    return NextResponse.json(
      { error: 'Receipt upstream unavailable', requestId, upstreamStatus: primaryStatus },
      // v26 (L1): tightened from max-age=10 to match the 404 path. The 5s
      // client poll cadence means a 10s cache can hide a recovered
      // platform for one full polling cycle.
      { status: 502, headers: { 'Cache-Control': 'public, max-age=2' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch receipt';
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
