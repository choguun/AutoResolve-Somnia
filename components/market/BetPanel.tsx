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
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <h2 className="mb-4 text-lg font-semibold">Place Bet</h2>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">{yesOdds.toFixed(1)}%</div>
          <div className="text-xs text-zinc-400">YES · {formatStt(market.yesTotal)}</div>
        </div>
        <div className="rounded-lg bg-rose-500/10 p-3 text-center">
          <div className="text-2xl font-bold text-rose-400">{noOdds.toFixed(1)}%</div>
          <div className="text-xs text-zinc-400">NO · {formatStt(market.noTotal)}</div>
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm text-zinc-400">Amount (STT)</label>
        <input
          type="number"
          min="0.001"
          step="0.001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={disabled}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-violet-500 focus:outline-none disabled:opacity-50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => placeBet(BetOption.Yes)}
          disabled={disabled || isPending || isConfirming}
          className="rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Bet YES
        </button>
        <button
          onClick={() => placeBet(BetOption.No)}
          disabled={disabled || isPending || isConfirming}
          className="rounded-lg bg-rose-600 px-4 py-3 font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
        >
          Bet NO
        </button>
      </div>
    </div>
  );
}
