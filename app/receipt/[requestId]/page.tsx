'use client';

import { use } from 'react';
import Link from 'next/link';
import { AgentReceiptViewer } from '@/components/receipts/AgentReceiptViewer';

export default function ReceiptPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = use(params);

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
      <AgentReceiptViewer key={requestId} requestId={requestId} />
    </div>
  );
}
