'use client';

import { useEffect, useState } from 'react';
import { parseEther } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { showConfirmedTransactionToast, showSubmittedTransactionToast } from '@/lib-web/transactionToast';
import { TransactionStatus } from '@/components/shared/TransactionStatus';
import {
  BetOption,
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  MarketStatus,
  formatStt,
  oddsPercent,
  type Market,
} from '@/lib-web/contract';

export function BetPanel({ marketId, market }: { marketId: bigint; market: Market }) {
  const [amount, setAmount] = useState('0.01');
  const disabled = market.status !== MarketStatus.Open || Date.now() >= Number(market.endTime) * 1000;

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const placeBet = (option: BetOption) => {
    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'bet',
        args: [marketId, option],
        value: parseEther(amount),
      },
      {
        onSuccess: (txHash) =>
          showSubmittedTransactionToast(
            txHash,
            `Placing ${option === BetOption.Yes ? 'YES' : 'NO'} bet...`,
            'place-bet'
          ),
        onError: (err) => toast.error(err.message.slice(0, 120)),
      }
    );
  };

  useEffect(() => {
    if (isSuccess) {
      showConfirmedTransactionToast(hash, 'Bet placed', 'place-bet');
    }
  }, [hash, isSuccess]);

  const yesOdds = oddsPercent(market.yesTotal, market.noTotal, 'yes');
  const noOdds = oddsPercent(market.yesTotal, market.noTotal, 'no');

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-2xl shadow-black/20 sm:p-8">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Place Bet</h2>
          <p className="text-sm text-zinc-500">Choose a side and stake STT before the market closes.</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-center shadow-inner backdrop-blur-sm">
          <div className="text-3xl font-extrabold text-emerald-300 drop-shadow-sm">{yesOdds.toFixed(1)}%</div>
          <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">YES · {formatStt(market.yesTotal)}</div>
        </div>
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-5 text-center shadow-inner backdrop-blur-sm">
          <div className="text-3xl font-extrabold text-rose-300 drop-shadow-sm">{noOdds.toFixed(1)}%</div>
          <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">NO · {formatStt(market.noTotal)}</div>
        </div>
      </div>

      <div className="mb-6">
        <label className="mb-2 block text-sm font-semibold uppercase tracking-wider text-zinc-300">Amount (STT)</label>
        <input
          type="number"
          min="0.001"
          step="0.001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={disabled}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white shadow-inner outline-none transition-all duration-300 focus:border-cyan-400/50 focus:bg-black/60 focus:ring-4 focus:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => placeBet(BetOption.Yes)}
          disabled={disabled || isPending || isConfirming}
          className="rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 py-3.5 font-bold text-emerald-950 shadow-[0_0_15px_rgba(52,211,153,0.3)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(52,211,153,0.5)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          Bet YES
        </button>
        <button
          onClick={() => placeBet(BetOption.No)}
          disabled={disabled || isPending || isConfirming}
          className="rounded-xl bg-gradient-to-r from-rose-400 to-rose-500 px-4 py-3.5 font-bold text-rose-950 shadow-[0_0_15px_rgba(251,113,133,0.3)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(251,113,133,0.5)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          Bet NO
        </button>
      </div>
      <TransactionStatus hash={hash} isConfirming={isConfirming} />
    </div>
  );
}
