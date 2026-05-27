'use client';

import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { CONTRACT_ABI, CONTRACT_ADDRESS, type Market } from '@/lib-web/contract';
import { useUserBets } from '@/hooks/useMarkets';

export function OutcomeDisplay({ market }: { market: Market }) {
  return (
    <div
      className={`rounded-lg border p-5 sm:p-6 ${
        market.outcome
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-50'
      }`}
    >
      <h2 className="mb-2 text-lg font-semibold">
        Resolved: {market.outcome ? 'YES' : 'NO'}
      </h2>
      {market.resolutionReason && (
        <p className="break-words rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-sm text-zinc-300">
          {market.resolutionReason}
        </p>
      )}
    </div>
  );
}

export function PayoutClaim({ marketId, market }: { marketId: bigint; market: Market }) {
  const { address } = useAccount();
  const { data: userBets } = useUserBets(marketId, address);
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const winningBets = market.outcome ? userBets?.yes : userBets?.no;
  const hasWinningBets = winningBets !== undefined && winningBets > 0n;

  if (!hasWinningBets) return null;

  const claim = () => {
    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'claimWinnings',
        args: [marketId],
      },
      {
        onSuccess: () => toast.success('Winnings claimed!'),
        onError: (err) => toast.error(err.message.slice(0, 120)),
      }
    );
  };

  return (
    <button
      onClick={claim}
      disabled={isPending || isConfirming}
      className="w-full rounded-lg bg-white px-6 py-3 font-semibold text-zinc-950 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending || isConfirming ? 'Claiming...' : 'Claim Winnings'}
    </button>
  );
}
