'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/lib-web/contract';
import { showConfirmedTransactionToast, showSubmittedTransactionToast } from '@/lib-web/transactionToast';
import { TransactionStatus } from '@/components/shared/TransactionStatus';

const DURATIONS = [
  { label: '5 min (demo)', seconds: 300 },
  { label: '1 hour', seconds: 3600 },
  { label: '6 hours', seconds: 21600 },
  { label: '24 hours', seconds: 86400 },
];

// Mirror the contract's _isHttpUrl: scheme is case-insensitive per RFC 3986 §3.1
// and leading ASCII whitespace is trimmed. Saves the user a failed tx.
function isValidSourceUrl(value: string): boolean {
  const trimmed = value.replace(/^\s+/, '');
  return /^https?:\/\//i.test(trimmed);
}

export function CreateMarketForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isConnected } = useAccount();
  const [question, setQuestion] = useState('');
  const [source, setSource] = useState('');
  const [duration, setDuration] = useState(300);

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (!isSuccess) return;
    // v46 (L1): mirror the v45 M2 BetPanel pattern on a successful
    // createMarket. The home page reads ['markets'] (keyed by
    // nextMarketId, see hooks/useMarkets.ts:71) and ['nextMarketId']
    // (L34). Without this invalidate, the just-created market doesn't
    // appear on `/` until the 10s useMarkets refetchInterval fires.
    // The router.push('/') below navigates the user but doesn't
    // refetch the cached query — the destination renders with the
    // stale list until the next poll. No address gate: createMarket
    // is a public write and the markets list is address-agnostic.
    queryClient.invalidateQueries({ queryKey: ['nextMarketId'] });
    queryClient.invalidateQueries({ queryKey: ['markets'] });
    showConfirmedTransactionToast(hash, 'Market created!', 'create-market');
    router.push('/');
  }, [hash, isSuccess, queryClient, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      toast.error('Connect your wallet first');
      return;
    }
    if (!question.trim() || !source.trim()) {
      toast.error('Fill in all fields');
      return;
    }
    if (!isValidSourceUrl(source.trim())) {
      toast.error('Resolution source must be an http(s) URL (case-insensitive)');
      return;
    }

    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'createMarket',
        args: [question.trim(), source.trim(), BigInt(duration)],
        // v61 (H1.6): pin gas to 2_500_000n. Same as BetPanel — the
        // on-chain gas cost is non-deterministic per block on Somnia
        // testnet (1.2M succeeded on one bet, failed on the next for
        // the same call), so 2.5M is the safe upper bound. See
        // BetPanel.tsx for the full rationale.
        gas: 2_500_000n,
      },
      {
        onSuccess: (txHash) => showSubmittedTransactionToast(txHash, 'Creating market...', 'create-market'),
        onError: (err) => toast.error(err.message.slice(0, 120)),
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-2xl shadow-black/40 sm:p-8">
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-200">Question</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Will Team A win the championship?"
          rows={3}
          maxLength={500}
          className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition-all duration-300 focus:border-cyan-400/50 focus:bg-black/60 focus:ring-4 focus:ring-cyan-400/20 shadow-inner"
        />
        <p className="mt-2 text-xs text-zinc-500">{question.length}/500 characters</p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-200">Resolution Source</label>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="https://en.wikipedia.org/wiki/Paris"
          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition-all duration-300 focus:border-cyan-400/50 focus:bg-black/60 focus:ring-4 focus:ring-cyan-400/20 shadow-inner"
        />
        <p className="mt-2 text-xs text-zinc-500">
          URL or domain the Somnia agent will scrape at resolution time
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-200">Duration</label>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {DURATIONS.map((d) => (
            <button
              key={d.seconds}
              type="button"
              onClick={() => setDuration(d.seconds)}
              className={`rounded-xl border px-3 py-3 text-sm font-medium transition-all duration-300 ${
                duration === d.seconds
                  ? 'border-cyan-400/50 bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-100 shadow-[0_0_15px_rgba(6,182,212,0.15)] scale-[1.02]'
                  : 'border-white/10 bg-black/40 text-zinc-400 hover:bg-white/5 hover:text-white shadow-inner hover:-translate-y-0.5'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-transparent p-4 text-sm leading-6 text-zinc-300 shadow-inner">
        At end time, an AI agent will scrape{' '}
        <strong className="break-all text-white">{source || '[source]'}</strong> to determine:{' '}
        <strong className="text-white">{question || '[question]'}</strong>
      </div>

      <button
        type="submit"
        disabled={isPending || isConfirming}
        className="w-full rounded-xl bg-gradient-to-r from-white to-cyan-100 px-6 py-3.5 font-bold text-zinc-950 transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
      >
        {isPending || isConfirming ? 'Creating...' : 'Create Market'}
      </button>
      <TransactionStatus hash={hash} isConfirming={isConfirming} />
    </form>
  );
}
