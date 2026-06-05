import { NextResponse } from 'next/server';
import {
  AGENTS_EXPLORER,
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
  // contract address. This matches `app/api/receipt/by-tx/[hash]/route.ts`
  // which also reads NEXT_PUBLIC_CONTRACT_ADDRESS.
  const SOMNIA_PLATFORM_FALLBACK = '0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776';
  const contractAddress =
    (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS && process.env.NEXT_PUBLIC_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000')
      ? process.env.NEXT_PUBLIC_CONTRACT_ADDRESS
      : SOMNIA_PLATFORM_FALLBACK;

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
      } catch {
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
      try {
        const data = (await primary.json()) as RawMinimalReceiptResponse;
        const receipt = normalizeMinimalReceipt(data);
        return NextResponse.json(receipt);
      } catch {
        primaryStatus = 200;
        // fall through to the 502 branch below
      }
    }

    if (primary && primaryStatus === 404) {
      return NextResponse.json(
        { error: 'Receipt not found', requestId, upstreamStatus: 404 },
        { status: 404, headers: { 'Cache-Control': 'public, max-age=10' } }
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
      } catch {
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
      { status: 502, headers: { 'Cache-Control': 'public, max-age=10' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch receipt';
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
