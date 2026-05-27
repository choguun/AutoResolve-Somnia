'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { MarketCard } from '@/components/markets/MarketCard';
import { useMarkets, useMyBetsMarkets } from '@/hooks/useMarkets';
import { MarketStatus } from '@/lib-web/contract';

type Tab = 'active' | 'resolved' | 'my-bets';

const TABS: { id: Tab; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'my-bets', label: 'My Bets' },
];

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('active');
  const { address, isConnected } = useAccount();
  const { data: markets, isLoading, error } = useMarkets();
  const { data: myBets, isLoading: myBetsLoading } = useMyBetsMarkets(markets, address);

  const myBetsById = new Map(
    myBets?.map(({ id, yes, no }) => [id.toString(), { yes, no }]) ?? []
  );

  const filtered =
    tab === 'my-bets'
      ? myBets?.map(({ id, market }) => ({ id, market }))
      : markets?.filter(({ market }) => {
          if (tab === 'active') return market.status !== MarketStatus.Resolved;
          return market.status === MarketStatus.Resolved;
        });

  const showLoading = isLoading || (tab === 'my-bets' && myBetsLoading);

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

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-2 text-sm transition ${
              tab === id
                ? 'bg-white/10 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
            {id === 'my-bets' && myBets && myBets.length > 0 && (
              <span className="ml-2 rounded-full bg-violet-500/30 px-2 py-0.5 text-xs text-violet-200">
                {myBets.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {showLoading && (
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

      {!showLoading && tab === 'my-bets' && !isConnected && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center">
          <p className="text-zinc-400">Connect your wallet to see markets you&apos;ve bet on.</p>
        </div>
      )}

      {!showLoading && filtered?.length === 0 && (tab !== 'my-bets' || isConnected) && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center">
          <p className="text-zinc-400">
            {tab === 'my-bets'
              ? 'No bets placed yet.'
              : `No ${tab} markets yet.`}
          </p>
          <Link href="/create" className="mt-4 inline-block text-violet-400 hover:underline">
            {tab === 'my-bets' ? 'Browse markets →' : 'Create the first market →'}
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {filtered?.map(({ id, market }) => (
          <MarketCard
            key={id.toString()}
            id={id}
            market={market}
            userBet={myBetsById.get(id.toString())}
          />
        ))}
      </div>
    </div>
  );
}
