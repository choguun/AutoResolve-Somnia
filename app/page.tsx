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
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl shadow-black/40">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-cyan-500/10 pointer-events-none" />
        <div className="relative flex flex-col gap-8 p-6 sm:p-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              Somnia agent-resolved markets
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-violet-200 drop-shadow-sm">
              Prediction Markets
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-300 sm:text-lg">
              Create markets, trade outcomes, and let Somnia&apos;s native LLM agents resolve
              results with verifiable on-chain receipts.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:min-w-80">
            <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-md shadow-inner transition-transform hover:scale-105">
              <div className="text-3xl font-bold text-white drop-shadow-md">{markets?.length ?? '—'}</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wider text-zinc-400">Total</div>
            </div>
            <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 backdrop-blur-md shadow-[0_0_20px_rgba(16,185,129,0.1)] shadow-inner transition-transform hover:scale-105">
              <div className="text-3xl font-bold text-emerald-300 drop-shadow-md">{activeCount}</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wider text-emerald-400/80">Active</div>
            </div>
            <div className="flex flex-col items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 p-4 backdrop-blur-md shadow-[0_0_20px_rgba(139,92,246,0.1)] shadow-inner transition-transform hover:scale-105">
              <div className="text-3xl font-bold text-violet-300 drop-shadow-md">{resolvedCount}</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wider text-violet-400/80">Resolved</div>
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

      <div className="flex w-full gap-2 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1.5 backdrop-blur-md sm:w-fit">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all duration-300 ease-out ${
              tab === id
                ? 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-lg shadow-cyan-900/30 scale-[1.02]'
                : 'text-zinc-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {label}
            {id === 'my-bets' && myBets && myBets.length > 0 && (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                tab === id ? 'bg-white/20 text-white' : 'bg-violet-500/20 text-violet-300'
              }`}>
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
