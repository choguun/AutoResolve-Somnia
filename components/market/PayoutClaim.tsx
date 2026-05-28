'use client';

import { useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { CONTRACT_ABI, CONTRACT_ADDRESS, type Market } from '@/lib-web/contract';
import { useUserBets } from '@/hooks/useMarkets';
import { showConfirmedTransactionToast, showSubmittedTransactionToast } from '@/lib-web/transactionToast';
import { TransactionStatus } from '@/components/shared/TransactionStatus';

export function OutcomeDisplay({ market }: { market: Market }) {
  return (
    <div
      className={`rounded-2xl border p-6 backdrop-blur-md shadow-xl sm:p-8 ${
        market.outcome
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-50 shadow-[0_0_30px_rgba(16,185,129,0.15)]'
          : 'border-rose-500/40 bg-rose-500/10 text-rose-50 shadow-[0_0_30px_rgba(244,63,94,0.15)]'
      }`}
    >
      <h2 className="mb-2 text-lg font-semibold">
        Resolved: {market.outcome ? 'YES' : 'NO'}
      </h2>
      {market.resolutionReason && (
        <p className="break-words rounded-xl border border-white/5 bg-black/40 p-4 font-mono text-sm leading-relaxed text-zinc-300 shadow-inner backdrop-blur-sm">
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
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const winningBets = market.outcome ? userBets?.yes : userBets?.no;
  const hasWinningBets = winningBets !== undefined && winningBets > 0n;

  useEffect(() => {
    if (isSuccess) {
      showConfirmedTransactionToast(hash, 'Winnings claimed!', 'claim-winnings');
    }
  }, [hash, isSuccess]);

  const claim = () => {
    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'claimWinnings',
        args: [marketId],
      },
      {
        onSuccess: (txHash) => showSubmittedTransactionToast(txHash, 'Claiming winnings...', 'claim-winnings'),
        onError: (err) => toast.error(err.message.slice(0, 120)),
      }
    );
  };

  if (!hasWinningBets) return null;

  return (
    <div>
      <button
        onClick={claim}
        disabled={isPending || isConfirming}
        className="w-full rounded-xl bg-gradient-to-r from-white to-violet-100 px-6 py-3.5 font-bold text-zinc-950 shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
      >
        {isPending || isConfirming ? 'Claiming...' : 'Claim Winnings'}
      </button>
      <TransactionStatus hash={hash} isConfirming={isConfirming} />
    </div>
  );
}
