'use client';

import { useState } from 'react';
import { parseEther } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
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
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

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
        onSuccess: () => toast.success(`Bet placed on ${option === BetOption.Yes ? 'YES' : 'NO'}`),
        onError: (err) => toast.error(err.message.slice(0, 120)),
      }
    );
  };

  const yesOdds = oddsPercent(market.yesTotal, market.noTotal, 'yes');
  const noOdds = oddsPercent(market.yesTotal, market.noTotal, 'no');

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/10 sm:p-6">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Place Bet</h2>
          <p className="text-sm text-zinc-500">Choose a side and stake STT before the market closes.</p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/10 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-200">{yesOdds.toFixed(1)}%</div>
          <div className="text-xs text-zinc-400">YES · {formatStt(market.yesTotal)}</div>
        </div>
        <div className="rounded-lg border border-rose-400/15 bg-rose-400/10 p-4 text-center">
          <div className="text-2xl font-bold text-rose-200">{noOdds.toFixed(1)}%</div>
          <div className="text-xs text-zinc-400">NO · {formatStt(market.noTotal)}</div>
        </div>
      </div>

      <div className="mb-5">
        <label className="mb-2 block text-sm font-medium text-zinc-300">Amount (STT)</label>
        <input
          type="number"
          min="0.001"
          step="0.001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={disabled}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-cyan-400/60 focus:ring-4 focus:ring-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => placeBet(BetOption.Yes)}
          disabled={disabled || isPending || isConfirming}
          className="rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Bet YES
        </button>
        <button
          onClick={() => placeBet(BetOption.No)}
          disabled={disabled || isPending || isConfirming}
          className="rounded-lg bg-rose-500 px-4 py-3 font-semibold text-rose-950 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Bet NO
        </button>
      </div>
    </div>
  );
}
