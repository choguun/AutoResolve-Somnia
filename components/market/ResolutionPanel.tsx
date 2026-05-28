'use client';

import { useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi';
import { toast } from 'sonner';
import { CONTRACT_ABI, CONTRACT_ADDRESS, formatStt } from '@/lib-web/contract';
import { useResolutionDeposit } from '@/hooks/useMarkets';
import { showConfirmedTransactionToast, showSubmittedTransactionToast } from '@/lib-web/transactionToast';
import { TransactionStatus } from '@/components/shared/TransactionStatus';

export function ResolutionPanel({
  marketId,
  canResolve,
  isResolving,
}: {
  marketId: bigint;
  canResolve: boolean;
  isResolving: boolean;
}) {
  const { data: deposit } = useResolutionDeposit();
  const { data: contractBalance } = useBalance({ address: CONTRACT_ADDRESS });
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const poolBalance = contractBalance?.value ?? 0n;
  const topUp =
    deposit && poolBalance < deposit ? deposit - poolBalance : 0n;

  const requestResolution = () => {
    if (!deposit) return;

    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'requestResolution',
        args: [marketId],
        value: topUp,
      },
      {
        onSuccess: (txHash) =>
          showSubmittedTransactionToast(txHash, 'Requesting autonomous resolution...', 'request-resolution'),
        onError: (err) => toast.error(err.message.slice(0, 120)),
      }
    );
  };

  useEffect(() => {
    if (isSuccess) {
      showConfirmedTransactionToast(hash, 'Resolution requested - agents are working', 'request-resolution');
    }
  }, [hash, isSuccess]);

  if (isResolving) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 backdrop-blur-md shadow-[0_0_20px_rgba(245,158,11,0.15)] sm:p-8">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          <div>
            <h2 className="font-semibold text-amber-200">Autonomous Resolution In Progress</h2>
            <p className="text-sm text-zinc-400">
              Somnia agents are scraping the web and classifying the outcome...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!canResolve) return null;

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-6 backdrop-blur-md shadow-xl shadow-black/20 sm:p-8">
      <h2 className="mb-2 text-lg font-semibold text-cyan-100">Request Autonomous Resolution</h2>
      <p className="mb-4 max-w-3xl text-sm leading-6 text-zinc-400">
        Trigger the two-stage Somnia agent pipeline: web scrape → YES/NO classification.
        Validators reach byte-identical consensus on the result.
      </p>
      {deposit && (
        <p className="mb-6 rounded-xl border border-white/5 bg-black/40 px-5 py-4 text-sm text-zinc-300 shadow-inner backdrop-blur-sm">
          Agent cost: <span className="font-mono text-white">{formatStt(deposit)}</span>
          <span className="text-zinc-500"> · Pool: {formatStt(poolBalance)}</span>
          {topUp > 0n && (
            <span className="text-zinc-500"> · Top-up from wallet: {formatStt(topUp)}</span>
          )}
        </p>
      )}
      <button
        onClick={requestResolution}
        disabled={isPending || isConfirming || !deposit}
        className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-white to-cyan-100 px-6 py-3.5 font-bold text-zinc-950 shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
      >
        {isPending || isConfirming ? 'Submitting...' : 'Request Resolution'}
      </button>
      <TransactionStatus hash={hash} isConfirming={isConfirming} />
    </div>
  );
}
