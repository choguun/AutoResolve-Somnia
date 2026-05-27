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
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/15 sm:p-7">
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-200">Question</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Will Team A win the championship?"
          rows={3}
          maxLength={500}
          className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition focus:border-cyan-400/60 focus:ring-4 focus:ring-cyan-400/10"
        />
        <p className="mt-2 text-xs text-zinc-500">{question.length}/500 characters</p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-200">Resolution Source</label>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="https://en.wikipedia.org/wiki/Paris"
          className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition focus:border-cyan-400/60 focus:ring-4 focus:ring-cyan-400/10"
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
              className={`rounded-lg border px-3 py-3 text-sm font-medium transition ${
                duration === d.seconds
                  ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100'
                  : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:text-white'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm leading-6 text-zinc-300">
        At end time, an AI agent will scrape{' '}
        <strong className="break-all text-white">{source || '[source]'}</strong> to determine:{' '}
        <strong className="text-white">{question || '[question]'}</strong>
      </div>

      <button
        type="submit"
        disabled={isPending || isConfirming}
        className="w-full rounded-lg bg-white px-6 py-3 font-semibold text-zinc-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending || isConfirming ? 'Creating...' : 'Create Market'}
      </button>
    </form>
  );
}
