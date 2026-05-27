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
      next: { revalidate: 0 },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: 'Receipt not found', requestId },
        { status: upstream.status === 404 ? 404 : 502 }
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
