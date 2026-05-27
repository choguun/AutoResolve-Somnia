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
    <div>
      <div className="mb-6">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Back to markets
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Agent Execution Receipt</h1>
        <p className="text-sm text-zinc-400">
          Verifiable proof of decentralized validator consensus on Somnia
        </p>
      </div>
      <AgentReceiptViewer requestId={requestId} />
    </div>
  );
}
