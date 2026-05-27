'use client';

import { useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi';
import { toast } from 'sonner';
import { CONTRACT_ABI, CONTRACT_ADDRESS, formatStt } from '@/lib-web/contract';
import { useResolutionDeposit } from '@/hooks/useMarkets';

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
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

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
        onSuccess: () => toast.success('Resolution requested — agents are working'),
        onError: (err) => toast.error(err.message.slice(0, 120)),
      }
    );
  };

  if (isResolving) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-5 sm:p-6">
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
    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-5 sm:p-6">
      <h2 className="mb-2 text-lg font-semibold text-cyan-100">Request Autonomous Resolution</h2>
      <p className="mb-4 max-w-3xl text-sm leading-6 text-zinc-400">
        Trigger the two-stage Somnia agent pipeline: web scrape → YES/NO classification.
        Validators reach byte-identical consensus on the result.
      </p>
      {deposit && (
        <p className="mb-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-300">
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
        className="rounded-lg bg-white px-6 py-3 font-semibold text-zinc-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending || isConfirming ? 'Submitting...' : 'Request Resolution'}
      </button>
    </div>
  );
}
