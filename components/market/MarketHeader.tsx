'use client';

import { MarketStatus, formatCountdown, formatStt, statusLabel, type Market } from '@/lib-web/contract';

export function MarketHeader({ market }: { market: Market }) {
  const totalPool = market.yesTotal + market.noTotal;

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/10 to-cyan-500/5 p-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
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
          <span className="text-sm text-cyan-400">{formatCountdown(market.endTime)}</span>
        )}
      </div>

      <h1 className="mb-2 text-2xl font-bold text-white">{market.question}</h1>
      <p className="mb-4 text-sm text-zinc-400">Source: {market.resolutionSource}</p>

      <div className="flex gap-6 text-sm text-zinc-300">
        <span>Total Pool: {formatStt(totalPool)}</span>
        <span>YES: {formatStt(market.yesTotal)}</span>
        <span>NO: {formatStt(market.noTotal)}</span>
      </div>
    </div>
  );
}
