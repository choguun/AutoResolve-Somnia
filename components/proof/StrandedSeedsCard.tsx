'use client';

import { useQuery } from '@tanstack/react-query';
import { formatStt } from '@/lib-web/contract';
import { addressExplorerUrl } from '@/lib-web/agents';
import { CopyButton } from '@/components/shared/CopyButton';
import { Skeleton } from '@/components/shared/Skeleton';

type StrandedMarket = {
  marketId: string;
  url: string;
  endTime: string;
  partialSeed?: boolean;
};

type StrandedSeedsResponse = {
  eoa: string;
  count: number;
  totalStrandedStt: string;
  markets: StrandedMarket[];
};

// v65 (L1): precision-preserving STT-string → wei conversion. The
// previous code did `Number(str) * 1e18` which loses precision for
// STT amounts > ~9e15 (9 STT) because JS Number is float64. This
// helper splits the string on '.', builds the integer part as a
// BigInt, and pads the fractional part to 18 digits before
// concatenating. Pure string manipulation + BigInt, no floats.
function sttStringToWei(sttString: string): bigint {
  const [intPart, fracPartRaw = ''] = sttString.split('.');
  const intWei = BigInt(intPart || '0') * 10n ** 18n;
  // Pad the fractional part to exactly 18 digits (e.g. "04" → "04" + 16 zeros).
  const fracPart = (fracPartRaw + '0'.repeat(18)).slice(0, 18);
  const fracWei = BigInt(fracPart || '0');
  // The integer part was multiplied by 10^18, so subtract the
  // fractional digits we already added: wei = intPart*1e18 + fracPart.
  // We just concatenate the two — intPart*1e18 already includes
  // 18 zeros of precision, and fracPart fills the lower 18 digits.
  return intWei + fracWei;
}

// v64 (M0): operator card for the dApp's /proof page. Polls
// /api/stranded-seeds every 30s and renders a list of markets
// where the relayer's auto-seed is stuck (parse-failure cache,
// contract underfunded, or agent pipeline). Pure on-chain
// derivation (no Railway coupling) — see app/api/stranded-seeds/
// route.ts for the logic.
export function StrandedSeedsCard() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<StrandedSeedsResponse>({
    queryKey: ['stranded-seeds'],
    queryFn: async () => {
      const r = await fetch('/api/stranded-seeds', { cache: 'no-store' });
      if (!r.ok) {
        throw new Error(`Stranded-seeds API returned ${r.status}`);
      }
      return r.json();
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  return (
    <section
      id="stranded-seeds"
      className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-rose-500/5 p-6 backdrop-blur-md shadow-[0_0_30px_rgba(251,191,36,0.08)]"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-amber-100">Stranded Seed Capital</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">
            Markets where the relayer placed the v62 auto-seed (0.01 STT YES + 0.01
            STT NO) but the resolution has not completed. The seed money is locked
            in <code className="text-amber-200">userYesBets</code> /{' '}
            <code className="text-amber-200">userNoBets</code> until the agent
            pipeline resolves the market, or the parse-failure LRU evicts the URL
            and the v63 stranded-seed recovery path re-attempts. Operators check{' '}
            <code>railway logs</code> for the recovery log line.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-all hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isFetching ? 'refreshing…' : 'refresh'}
        </button>
      </div>
      {isLoading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">
          Failed to read stranded-seeds from chain. The endpoint is on-chain
          derived (see <code>/api/stranded-seeds</code>), so a failure here
          usually means the Somnia RPC is degraded. Check{' '}
          <code>useRpcHealth</code> above and retry.
        </div>
      ) : data && data.count > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-amber-300 drop-shadow-sm">
                {data.count}
              </span>
              <span className="text-sm font-semibold text-zinc-400">market(s)</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-rose-300 drop-shadow-sm">
                {formatStt(sttStringToWei(data.totalStrandedStt))}
              </span>
              <span className="text-sm font-semibold text-zinc-400">locked</span>
            </div>
            {data.eoa && (
              <a
                href={addressExplorerUrl(data.eoa)}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-xs text-cyan-300 hover:underline"
              >
                relayer EOA
              </a>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-amber-400/20 text-xs uppercase tracking-wider text-amber-300">
                <tr>
                  <th className="py-2 pr-3">Market</th>
                  <th className="py-2 pr-3">Source URL</th>
                  <th className="py-2 pr-3">Expired</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.markets.map((m) => (
                  <tr
                    key={m.marketId}
                    className="border-b border-white/5 transition-colors hover:bg-amber-400/5"
                  >
                    <td className="py-2 pr-3 font-mono">
                      <a
                        href={`/market/${m.marketId}`}
                        className="text-cyan-300 hover:underline"
                      >
                        #{m.marketId}
                      </a>
                    </td>
                    <td className="max-w-md truncate py-2 pr-3 text-xs text-zinc-300">
                      {m.url}
                      <CopyButton value={m.url} className="ml-1" />
                    </td>
                    <td className="py-2 pr-3 text-xs text-zinc-500">
                      {new Date(Number(m.endTime) * 1000).toISOString()}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {m.partialSeed ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 font-semibold text-rose-200">
                          partial
                        </span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-3 text-sm text-emerald-200">
          <strong>No stranded seeds.</strong> The relayer EOA has no
          unresolved auto-seed positions. If you just enabled the v62
          auto-liquidity feature, wait one tick for the first markets to
          be created and seeded.
        </div>
      )}
    </section>
  );
}
