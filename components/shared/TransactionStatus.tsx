'use client';

import type { Hash } from 'viem';
import { txExplorerUrl } from '@/lib-web/agents';

export function TransactionStatus({
  hash,
  isConfirming,
}: {
  hash?: Hash;
  isConfirming?: boolean;
}) {
  if (!hash) return null;

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
      <span>{isConfirming ? 'Waiting for confirmation' : 'Transaction submitted'}</span>
      <a
        href={txExplorerUrl(hash)}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-cyan-200 transition hover:text-cyan-100"
      >
        View transaction
      </a>
    </div>
  );
}
