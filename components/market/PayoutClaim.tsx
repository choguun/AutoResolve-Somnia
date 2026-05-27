'use client';

import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { CONTRACT_ABI, CONTRACT_ADDRESS, type Market } from '@/lib-web/contract';
import { useUserBets } from '@/hooks/useMarkets';

export function OutcomeDisplay({ market }: { market: Market }) {
  return (
    <div
      className={`rounded-xl border p-6 ${
        market.outcome
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-rose-500/30 bg-rose-500/10'
      }`}
    >
      <h2 className="mb-2 text-lg font-semibold">
        Resolved: {market.outcome ? 'YES' : 'NO'}
      </h2>
      {market.resolutionReason && (
        <p className="font-mono text-sm text-zinc-300">{market.resolutionReason}</p>
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
      className="w-full rounded-lg bg-violet-600 px-6 py-3 font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
    >
      {isPending || isConfirming ? 'Claiming...' : 'Claim Winnings'}
    </button>
  );
}
