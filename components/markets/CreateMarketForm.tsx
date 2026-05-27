'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/lib-web/contract';

const DURATIONS = [
  { label: '5 min (demo)', seconds: 300 },
  { label: '1 hour', seconds: 3600 },
  { label: '6 hours', seconds: 21600 },
  { label: '24 hours', seconds: 86400 },
];

export function CreateMarketForm() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const [question, setQuestion] = useState('');
  const [source, setSource] = useState('');
  const [duration, setDuration] = useState(300);

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      toast.success('Market created!', { id: 'create-market' });
      router.push('/');
    }
  }, [isSuccess, router]);

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

    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'createMarket',
        args: [question.trim(), source.trim(), BigInt(duration)],
      },
      {
        onSuccess: () => toast.loading('Creating market...', { id: 'create-market' }),
        onError: (err) => toast.error(err.message.slice(0, 120)),
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-300">Question</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Will Team A win the championship?"
          rows={3}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-zinc-500">{question.length}/500 characters</p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-300">Resolution Source</label>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="https://en.wikipedia.org/wiki/Paris"
          className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-zinc-500">
          URL or domain the Somnia agent will scrape at resolution time
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-300">Duration</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DURATIONS.map((d) => (
            <button
              key={d.seconds}
              type="button"
              onClick={() => setDuration(d.seconds)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                duration === d.seconds
                  ? 'border-violet-500 bg-violet-500/20 text-violet-200'
                  : 'border-white/10 text-zinc-400 hover:border-white/20'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-4 text-sm text-zinc-300">
        At end time, an AI agent will scrape <strong className="text-white">{source || '[source]'}</strong>{' '}
        to determine: <strong className="text-white">{question || '[question]'}</strong>
      </div>

      <button
        type="submit"
        disabled={isPending || isConfirming}
        className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-6 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {isPending || isConfirming ? 'Creating...' : 'Create Market'}
      </button>
    </form>
  );
}
