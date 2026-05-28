'use client';

import { MarketStatus, formatCountdown, formatStt, statusLabel, type Market } from '@/lib-web/contract';

export function MarketHeader({ market }: { market: Market }) {
  const totalPool = market.yesTotal + market.noTotal;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-2xl shadow-black/40 sm:p-8">
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

      <h1 className="max-w-4xl text-3xl font-extrabold leading-tight tracking-tight text-white drop-shadow-sm sm:text-5xl">
        {market.question}
      </h1>
      <p className="mt-5 break-all rounded-xl border border-white/5 bg-black/40 px-5 py-3 text-sm text-zinc-400 shadow-inner backdrop-blur-sm">
        Source: <span className="font-semibold text-zinc-200">{market.resolutionSource}</span>
      </p>

      <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
        <div className="rounded-xl border border-white/5 bg-black/40 p-5 shadow-inner backdrop-blur-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Total Pool</div>
          <div className="mt-2 text-xl font-bold text-white drop-shadow-sm">{formatStt(totalPool)}</div>
        </div>
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-5 shadow-[0_0_15px_rgba(16,185,129,0.1)] shadow-inner backdrop-blur-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400/80">YES</div>
          <div className="mt-2 text-xl font-bold text-emerald-300 drop-shadow-sm">{formatStt(market.yesTotal)}</div>
        </div>
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-5 shadow-[0_0_15px_rgba(244,63,94,0.1)] shadow-inner backdrop-blur-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-rose-400/80">NO</div>
          <div className="mt-2 text-xl font-bold text-rose-300 drop-shadow-sm">{formatStt(market.noTotal)}</div>
        </div>
      </div>
    </div>
  );
}
