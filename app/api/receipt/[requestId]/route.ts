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
function alternateReceiptServiceUrl(
  requestId: string,
  type: 'minimal' | 'full' = 'minimal'
): string {
  const url = new URL(`${AGENTS_EXPLORER}/agent-receipts`);
  url.searchParams.set('requestId', requestId);
  url.searchParams.set('contractAddress', '0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776');
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
      const res = await fetchUpstream(receiptServiceUrl(requestId, 'minimal'));
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
      const data = (await primary.json()) as RawMinimalReceiptResponse;
      const receipt = normalizeMinimalReceipt(data);
      return NextResponse.json(receipt);
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
    if (primaryStatus >= 500) {
      try {
        const fallback = await fetchUpstream(
          alternateReceiptServiceUrl(requestId, 'minimal'),
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
    return NextResponse.json(
      { error: 'Receipt upstream unavailable', requestId, upstreamStatus: primaryStatus },
      { status: 502 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch receipt';
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
