'use client';

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AgentReceiptViewer } from '@/components/receipts/AgentReceiptViewer';
import type { ReceiptKind } from '@/hooks/useAgentReceipt';

export default function ReceiptPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = use(params);
  // v23 (H1): the AgentReceiptViewer branches its long-running / error copy
  // on whether the receiptId came from the resolution pipeline or the
  // generation pipeline. The two pipelines have different recovery stories
  // (resolution has forceResetMarket; generation has no on-chain reset — the
  // inference deposit was forwarded to the platform and is not refundable),
  // so the messaging matters. Callers (GenerateMarketForm, AgentCommandCenter
  // generation pipeline) pass `?kind=generation` in the URL; resolution
  // callers leave it unset. The viewer defaults to 'resolution' when absent
  // so existing /receipt/<resolutionReqId> links keep their old copy.
  const searchParams = useSearchParams();
  const kind: ReceiptKind =
    searchParams.get('kind') === 'generation' ? 'generation' : 'resolution';

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.045] p-5 sm:p-7">
        <Link href="/" className="text-sm text-cyan-200 transition hover:text-cyan-100">
          Back to markets
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Agent Execution Receipt</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Verifiable proof of decentralized validator consensus on Somnia
        </p>
      </div>
      <AgentReceiptViewer key={requestId} requestId={requestId} kind={kind} />
    </div>
  );
}
