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

  try {
    const upstream = await fetchUpstream(receiptServiceUrl(requestId, 'minimal'));

    if (!upstream.ok) {
      // A 404 from the upstream is a "this requestId will never resolve"
      // signal — negative cache it for 10s so a stale link (typo, never-valid
      // requestId) doesn't round-trip on every page view. Anything else
      // (502/503/504 from a flaky upstream) must NOT be cached: the next call
      // may recover immediately, and we'd rather burn an extra upstream
      // request than mask a transient outage.
      if (upstream.status === 404) {
        return NextResponse.json(
          { error: 'Receipt not found', requestId, upstreamStatus: 404 },
          { status: 404, headers: { 'Cache-Control': 'public, max-age=10' } }
        );
      }

      // v15: on a 5xx from the primary host, try the alternate host before
      // giving up. The platform exposes the same `agent-receipts` endpoint on
      // both hosts, so a single-host outage shouldn't break the receipt page.
      if (upstream.status >= 500) {
        try {
          const fallback = await fetchUpstream(alternateReceiptServiceUrl(requestId, 'minimal'));
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
        { error: 'Receipt upstream unavailable', requestId, upstreamStatus: upstream.status },
        { status: 502 }
      );
    }

    const data = (await upstream.json()) as RawMinimalReceiptResponse;
    const receipt = normalizeMinimalReceipt(data);

    return NextResponse.json(receipt);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch receipt';
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
