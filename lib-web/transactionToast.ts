'use client';

import type { Hash } from 'viem';
import { toast } from 'sonner';
import { txExplorerUrl } from '@/lib-web/agents';

function openTransaction(hash: Hash) {
  window.open(txExplorerUrl(hash), '_blank', 'noopener,noreferrer');
}

export function showSubmittedTransactionToast(hash: Hash, message: string, id?: string) {
  toast.loading(message, {
    id,
    description: `${hash.slice(0, 10)}...${hash.slice(-8)}`,
    action: {
      label: 'View transaction',
      onClick: () => openTransaction(hash),
    },
  });
}

export function showConfirmedTransactionToast(hash: Hash | undefined, message: string, id?: string) {
  toast.success(message, {
    id,
    action: hash
      ? {
          label: 'View transaction',
          onClick: () => openTransaction(hash),
        }
      : undefined,
  });
}
