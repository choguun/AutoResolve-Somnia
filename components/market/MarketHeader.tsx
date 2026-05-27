'use client';

import { MarketStatus, formatCountdown, formatStt, statusLabel, type Market } from '@/lib-web/contract';

export function MarketHeader({ market }: { market: Market }) {
  const totalPool = market.yesTotal + market.noTotal;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/15 sm:p-7">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            market.status === MarketStatus.Open
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : market.status === MarketStatus.Resolving
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-violet-500/30 bg-violet-500/10 text-violet-300'
          }`}
        >
          {statusLabel(market.status)}
        </span>
        {market.status !== MarketStatus.Resolved && (
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
            {formatCountdown(market.endTime)}
          </span>
        )}
      </div>

      <h1 className="max-w-4xl text-2xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
        {market.question}
      </h1>
      <p className="mt-4 break-all rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-400">
        Source: <span className="text-zinc-200">{market.resolutionSource}</span>
      </p>

      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-zinc-500">Total Pool</div>
          <div className="mt-1 text-lg font-semibold text-white">{formatStt(totalPool)}</div>
        </div>
        <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/10 p-4">
          <div className="text-xs text-emerald-200/70">YES</div>
          <div className="mt-1 text-lg font-semibold text-emerald-200">{formatStt(market.yesTotal)}</div>
        </div>
        <div className="rounded-lg border border-rose-400/15 bg-rose-400/10 p-4">
          <div className="text-xs text-rose-200/70">NO</div>
          <div className="mt-1 text-lg font-semibold text-rose-200">{formatStt(market.noTotal)}</div>
        </div>
      </div>
    </div>
  );
}
