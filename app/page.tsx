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
  const activeCount =
    markets?.filter(({ market }) => market.status !== MarketStatus.Resolved).length ?? 0;
  const resolvedCount =
    markets?.filter(({ market }) => market.status === MarketStatus.Resolved).length ?? 0;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-8 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
              Somnia agent-resolved markets
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Prediction Markets
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
              Create markets, trade outcomes, and let Somnia&apos;s native LLM agents resolve
              results with verifiable on-chain receipts.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:min-w-80">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-2xl font-semibold text-white">{markets?.length ?? '—'}</div>
              <div className="mt-1 text-xs text-zinc-500">Total</div>
            </div>
            <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/10 p-3">
              <div className="text-2xl font-semibold text-emerald-200">{activeCount}</div>
              <div className="mt-1 text-xs text-emerald-200/70">Active</div>
            </div>
            <div className="rounded-lg border border-violet-400/15 bg-violet-400/10 p-3">
              <div className="text-2xl font-semibold text-violet-200">{resolvedCount}</div>
              <div className="mt-1 text-xs text-violet-200/70">Resolved</div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Markets</h2>
          <p className="mt-1 text-sm text-zinc-500">Browse live markets and agent outcomes.</p>
        </div>
        <Link
          href="/create"
          className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-cyan-950/20 transition hover:bg-cyan-100"
        >
          Create Market
        </Link>
      </div>

      <div className="flex w-full gap-1 overflow-x-auto rounded-lg border border-white/10 bg-white/[0.035] p-1 sm:w-fit">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`shrink-0 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === id
                ? 'bg-white text-zinc-950 shadow-sm'
                : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-lg border border-white/10 bg-white/5" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-6 text-rose-100">
          Could not load markets. Ensure the contract is deployed and{' '}
          <code className="rounded bg-black/25 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_CONTRACT_ADDRESS</code> is set.
        </div>
      )}

      {!showLoading && tab === 'my-bets' && !isConnected && (
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-10 text-center">
          <p className="text-white">Connect your wallet</p>
          <p className="mt-2 text-sm text-zinc-500">Your active and resolved positions will appear here.</p>
        </div>
      )}

      {!showLoading && filtered?.length === 0 && (tab !== 'my-bets' || isConnected) && (
        <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.035] p-10 text-center">
          <p className="font-medium text-white">
            {tab === 'my-bets'
              ? 'No bets placed yet.'
              : `No ${tab} markets yet.`}
          </p>
          <Link href={tab === 'my-bets' ? '/' : '/create'} className="mt-4 inline-flex rounded-lg border border-white/10 px-4 py-2 text-sm text-cyan-200 transition hover:bg-white/5">
            {tab === 'my-bets' ? 'Browse markets' : 'Create the first market'}
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
