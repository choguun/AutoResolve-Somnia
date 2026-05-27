'use client';

import { useState } from 'react';
import { MarketCard } from '@/components/markets/MarketCard';
import { useMarkets } from '@/hooks/useMarkets';
import { MarketStatus } from '@/lib-web/contract';
import Link from 'next/link';

type Tab = 'active' | 'resolved';

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('active');
  const { data: markets, isLoading, error } = useMarkets();

  const filtered = markets?.filter(({ market }) => {
    if (tab === 'active') return market.status !== MarketStatus.Resolved;
    return market.status === MarketStatus.Resolved;
  });

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Prediction Markets</h1>
          <p className="mt-2 text-zinc-400">
            Autonomous resolution powered by Somnia&apos;s native LLM agents
          </p>
        </div>
        <Link
          href="/create"
          className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Create Market
        </Link>
      </div>

      <div className="mb-6 flex gap-2">
        {(['active', 'resolved'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm capitalize transition ${
              tab === t
                ? 'bg-white/10 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200">
          Could not load markets. Ensure the contract is deployed and{' '}
          <code className="text-xs">NEXT_PUBLIC_CONTRACT_ADDRESS</code> is set.
        </div>
      )}

      {!isLoading && filtered?.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center">
          <p className="text-zinc-400">No {tab} markets yet.</p>
          <Link href="/create" className="mt-4 inline-block text-violet-400 hover:underline">
            Create the first market →
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {filtered?.map(({ id, market }) => (
          <MarketCard key={id.toString()} id={id} market={market} />
        ))}
      </div>
    </div>
  );
}
