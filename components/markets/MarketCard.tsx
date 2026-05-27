'use client';

import Link from 'next/link';
import {
  formatCountdown,
  formatStt,
  MarketStatus,
  oddsPercent,
  statusLabel,
  type Market,
} from '@/lib-web/contract';

function StatusBadge({ status }: { status: MarketStatus }) {
  const styles = {
    [MarketStatus.Open]: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    [MarketStatus.Resolving]: 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse',
    [MarketStatus.Resolved]: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  };

  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {statusLabel(status)}
    </span>
  );
}

export function MarketCard({ id, market }: { id: bigint; market: Market }) {
  const totalPool = market.yesTotal + market.noTotal;
  const yesOdds = oddsPercent(market.yesTotal, market.noTotal, 'yes');

  return (
    <Link
      href={`/market/${id.toString()}`}
      className="group block rounded-xl border border-white/10 bg-white/5 p-5 transition hover:border-violet-500/40 hover:bg-white/[0.07]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-semibold leading-snug text-white group-hover:text-violet-200">
          {market.question}
        </h3>
        <StatusBadge status={market.status} />
      </div>

      <p className="mb-4 truncate text-sm text-zinc-500">{market.resolutionSource}</p>

      <div className="flex items-center justify-between text-sm">
        <div className="flex gap-4 text-zinc-400">
          <span>Pool: {formatStt(totalPool)}</span>
          <span>YES {yesOdds.toFixed(0)}%</span>
        </div>
        <span className="text-cyan-400">
          {market.status === MarketStatus.Resolved
            ? market.outcome
              ? 'Resolved YES'
              : 'Resolved NO'
            : formatCountdown(market.endTime)}
        </span>
      </div>
    </Link>
  );
}
