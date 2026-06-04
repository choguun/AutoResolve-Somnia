import { NextResponse } from 'next/server';
import {
  normalizeMinimalReceipt,
  receiptServiceUrl,
  type RawMinimalReceiptResponse,
} from '@/lib-web/agents';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;

  if (!requestId || requestId === '0' || !/^\d+$/.test(requestId)) {
    return NextResponse.json({ error: 'Invalid request ID' }, { status: 400 });
  }

  try {
    const upstream = await fetch(receiptServiceUrl(requestId, 'minimal'), {
      headers: { Accept: 'application/json' },
      // Cache for 5s on the server to absorb repeated views of the same receipt
      // (judge deep-links, manual refresh, etc.). The client polls every 5s, so
      // 5s revalidate keeps the UI feeling live while collapsing upstream calls.
      next: { revalidate: 5 },
    });

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
