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

export function MarketCard({
  id,
  market,
  userBet,
}: {
  id: bigint;
  market: Market;
  userBet?: { yes: bigint; no: bigint };
}) {
  const totalPool = market.yesTotal + market.noTotal;
  const yesOdds = oddsPercent(market.yesTotal, market.noTotal, 'yes');
  const yourSide =
    userBet && userBet.yes > 0n
      ? `YES · ${formatStt(userBet.yes)}`
      : userBet && userBet.no > 0n
        ? `NO · ${formatStt(userBet.no)}`
        : null;

  return (
    <Link
      href={`/market/${id.toString()}`}
      className="group flex min-h-52 flex-col rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/[0.07]"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="line-clamp-3 font-semibold leading-snug text-white transition-colors group-hover:text-cyan-100">
          {market.question}
        </h3>
        <StatusBadge status={market.status} />
      </div>

      <p className="mb-5 truncate rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">
        {market.resolutionSource}
      </p>

      <div className="mt-auto space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-black/20 p-3">
            <div className="text-xs text-zinc-500">Pool</div>
            <div className="mt-1 font-semibold text-white">{formatStt(totalPool)}</div>
          </div>
          <div className="rounded-md bg-emerald-400/10 p-3">
            <div className="text-xs text-emerald-200/70">YES odds</div>
            <div className="mt-1 font-semibold text-emerald-200">{yesOdds.toFixed(0)}%</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
          <span className="truncate text-xs text-violet-200">
            {yourSide ? `Your bet: ${yourSide}` : 'No position yet'}
          </span>
          <span className="shrink-0 text-right text-xs font-medium text-cyan-200">
          {market.status === MarketStatus.Resolved
            ? market.outcome
              ? 'Resolved YES'
              : 'Resolved NO'
            : formatCountdown(market.endTime)}
          </span>
        </div>
      </div>
    </Link>
  );
}
