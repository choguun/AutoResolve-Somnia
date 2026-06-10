'use client';

import { useEffect, useState } from 'react';
import { MarketStatus } from '@/lib-web/contract';

type Variant = 'card' | 'header' | 'resolved';

type Props = {
  endTime: bigint;
  status?: MarketStatus;
  variant?: Variant;
  className?: string;
};

// Live-ticking countdown for a market's endTime. Renders a
// formatted "23h 5m" / "5m 12s" / "42s" / "Ended" string, refreshed
// every second (the only granularity formatCountdown exposes below
// the minute boundary is seconds, so 1Hz is the right tick rate).
//
// `variant` is a tiny switch so the two consumer call sites
// (MarketCard, MarketHeader) can share one implementation without
// re-styling per site. `resolved` is the third state for cards
// that already show the "Resolved YES/NO" footer text — the
// component renders nothing in that case (the parent renders
// instead).
export function LiveCountdown({ endTime, status, variant = 'card', className = '' }: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Defer the first render until the client is mounted so the SSR
    // HTML matches the first client render (no hydration mismatch on
    // "5m 12s" vs "5m 11s" between server and client).
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // While waiting for the first tick (SSR + first hydration
  // paint), render an empty placeholder of the same shape as the
  // real output so the card layout doesn't shift.
  if (now == null) {
    return <span className={className} aria-hidden="true">&nbsp;</span>;
  }

  // For Resolved markets, the card already shows "Resolved YES/NO"
  // in the footer; the header shows the status badge. Render
  // nothing here so we don't double-print the outcome.
  if (status === MarketStatus.Resolved) {
    return null;
  }

  const text = formatCountdownAt(endTime, now);
  const ended = text === 'Ended';
  // Sub-minute windows deserve the amber pulse so the user notices
  // the resolution window is closing. Sub-hour windows keep the
  // cyan tint without the pulse so the badge doesn't visually scream
  // for 59 minutes.
  const minutes = minutesBetween(endTime, now);
  const urgent = !ended && minutes > 0 && minutes < 1;
  const warm = !ended && minutes >= 1 && minutes < 60;

  return (
    <span
      className={[
        className,
        variant === 'card'
          ? 'shrink-0 text-right text-xs font-bold uppercase tracking-wide'
          : 'rounded-full border px-3 py-1 text-xs font-medium',
        ended
          ? variant === 'card'
            ? 'text-zinc-500'
            : 'border-zinc-700 bg-zinc-800/40 text-zinc-400'
          : urgent
            ? variant === 'card'
              ? 'text-amber-300'
              : 'border-amber-400/40 bg-amber-400/10 text-amber-200 animate-pulse'
            : warm
              ? variant === 'card'
                ? 'text-amber-200'
                : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
              : variant === 'card'
                ? 'text-cyan-300'
                : 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
      ].join(' ')}
      aria-label={ended ? 'Market has ended' : `Time remaining: ${text}`}
      title={ended ? 'Market has ended' : `Resolves in ${text}`}
    >
      {text}
    </span>
  );
}

// Inlined endTimeMs+formatCountdown so the live tick is one Date.now() per
// render, not two. Mirrors the math in lib-web/contract.ts.
function formatCountdownAt(endTime: bigint, now: number): string {
  if (endTime > 0xFFFFFFFFn) return 'Ended';
  const endMs = Number(endTime & 0xFFFFFFFFn) * 1000;
  const diff = endMs - now;
  if (diff <= 0) return 'Ended';
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function minutesBetween(endTime: bigint, now: number): number {
  if (endTime > 0xFFFFFFFFn) return 0;
  const endMs = Number(endTime & 0xFFFFFFFFn) * 1000;
  return Math.max(0, Math.floor((endMs - now) / 60000));
}
