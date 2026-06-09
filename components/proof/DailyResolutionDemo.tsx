'use client';

// v56 (H0): new "Daily Resolution Demo" section for /proof.
// We intentionally do not import `requestGeneration` from AgentCommandCenter —
// that function is tightly coupled to the AgentCommandCenter's own
// pendingInvoke Map, useGenerationFailures hooks, and panel state. The
// submission path below is a wagmi writeContract + receipt/marketId polling
// pattern, identical in shape but independent in state. The two panels
// target different operator personas (judge running today's demo vs. operator
// triaging a generation queue) and the duplication is the cheaper invariant.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  useAccount,
  useConfig,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { readContract } from 'wagmi/actions';
import {
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  MarketStatus,
  formatStt,
  isAgentCreated,
  statusLabel,
} from '@/lib-web/contract';
import { useAgentReceipt } from '@/hooks/useAgentReceipt';
import { useMarketCreatedByRequestId } from '@/hooks/useMarketCreatedByRequestId';
import { useMarket } from '@/hooks/useMarkets';
import { receiptIsComplete } from '@/lib-web/agents';
import { TransactionStatus } from '@/components/shared/TransactionStatus';
import {
  showConfirmedTransactionToast,
  showSubmittedTransactionToast,
} from '@/lib-web/transactionToast';

const STORAGE_KEY_MARKET = 'autoresolve.dailyMarketId';
const STORAGE_KEY_REQUEST = 'autoresolve.dailyRequestId';
const MAX_TOPIC_FOR_AGENT = 200;

type DailyTopicResponse = {
  topic: string | null;
  dayOfYear: number;
  totalTopics: number;
  index: number;
  durationHint: number;
};

async function fetchDailyTopic(): Promise<DailyTopicResponse> {
  const res = await fetch('/api/daily-topic', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`daily-topic ${res.status}`);
  }
  return (await res.json()) as DailyTopicResponse;
}

function formatDurationSeconds(seconds: number): string {
  if (seconds >= 86400) return `${Math.round(seconds / 86400)}d`;
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`;
  return `${seconds}s`;
}

function safeSetLocalStorage(key: string, value: string | null): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeGetLocalStorage(key: string): bigint | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const n = BigInt(raw);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

export function DailyResolutionDemo() {
  const { isConnected } = useAccount();
  const config = useConfig();

  const { data: dailyTopic, refetch: refetchDailyTopic } = useQuery<DailyTopicResponse>({
    queryKey: ['daily-topic'],
    queryFn: fetchDailyTopic,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const [dailyMarketId, setDailyMarketId] = useState<bigint | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [requestId, setRequestId] = useState<bigint | null>(null);
  const [topUpNeeded, setTopUpNeeded] = useState<bigint | null>(null);
  const [fundingError, setFundingError] = useState<string | null>(null);

  // Rehydrate persisted marketId + requestId on mount; try/catch covers
  // private mode. v56 (L0) audit fix: persist requestId alongside
  // marketId so the receipt link survives a reload — without this, a
  // judge who hits /proof after the creation tx confirms sees the
  // market card but no "View live inference receipt" link, because
  // the by-tx recovery effect only runs against the current session's
  // writeContract hash.
  useEffect(() => {
    const id = safeGetLocalStorage(STORAGE_KEY_MARKET);
    const reqId = safeGetLocalStorage(STORAGE_KEY_REQUEST);
    if (id) setDailyMarketId(id);
    if (reqId) setRequestId(reqId);
    if (!id) {
      // Probe localStorage to determine if it's available at all (vs. just empty).
      setStorageAvailable(safeSetLocalStorage(STORAGE_KEY_MARKET, null));
    }
  }, []);

  // Persist dailyMarketId whenever it changes.
  useEffect(() => {
    if (dailyMarketId == null) return;
    const ok = safeSetLocalStorage(STORAGE_KEY_MARKET, dailyMarketId.toString());
    if (!ok) setStorageAvailable(false);
  }, [dailyMarketId]);

  // Persist requestId whenever it changes. Cleared alongside marketId
  // by clearDailyMarketId.
  useEffect(() => {
    if (requestId == null) {
      safeSetLocalStorage(STORAGE_KEY_REQUEST, null);
      return;
    }
    safeSetLocalStorage(STORAGE_KEY_REQUEST, requestId.toString());
  }, [requestId]);

  // One-time toast if storage is unavailable (private mode, etc.).
  useEffect(() => {
    if (storageAvailable === false) {
      toast.warning(
        'localStorage is unavailable in this browser — the daily market id will not survive a page reload.',
        { id: 'autoresolve.storage-unavailable' },
      );
    }
  }, [storageAvailable]);

  // Read the generation funding status on mount AND after each successful
  // creation (when requestId flips from null to a value). v56 (L0) audit
  // fix: the pre-L0 effect only had `[config]` as its dep, so the deposit
  // figure displayed in the panel went stale after a successful creation
  // (the contract spent 0.3 STT on the inference deposit; topUpNeeded
  // changes accordingly). Adding requestId to the deps refetches the
  // post-creation funding state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = (await readContract(config, {
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getGenerationFundingStatus',
        })) as readonly [bigint, bigint, bigint];
        if (cancelled) return;
        setTopUpNeeded(status[2]);
        setFundingError(null);
      } catch (err) {
        if (cancelled) return;
        setFundingError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config, requestId]);

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Recover the requestId from the confirmed tx via the by-tx endpoint
  // (v16 M3 / v36 L0 pattern from GenerateMarketForm.tsx:87-132).
  const warnedAboutFilterRef = useRef(false);
  useEffect(() => {
    if (!isSuccess || !hash) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/receipt/by-tx/${hash}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          primaryRequestId?: string;
          primaryKind?: 'generation' | 'resolution';
          contractFilterApplied?: boolean;
        };
        if (cancelled) return;
        if (data.contractFilterApplied === false && !warnedAboutFilterRef.current) {
          warnedAboutFilterRef.current = true;
          toast.warning(
            'Server is running without NEXT_PUBLIC_CONTRACT_ADDRESS set — ' +
              'the by-tx lookup is permissive. Set it in .env for production.',
          );
        }
        if (data.primaryRequestId && data.primaryKind === 'generation') {
          setRequestId(BigInt(data.primaryRequestId));
        }
      } catch (err) {
        console.warn(
          `[DailyResolutionDemo] by-tx lookup error for ${hash}:`,
          err instanceof Error ? err.message : err,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuccess, hash]);

  const { data: agentReceipt } = useAgentReceipt(requestId ?? undefined, 'generation');

  const { data: newMarketId } = useMarketCreatedByRequestId(
    requestId,
    !!agentReceipt &&
      (agentReceipt.status !== 'failure' || !receiptIsComplete(agentReceipt)),
  );

  useEffect(() => {
    if (newMarketId == null) return;
    setDailyMarketId(newMarketId);
  }, [newMarketId]);

  useEffect(() => {
    if (!agentReceipt || !hash) return;
    if (!receiptIsComplete(agentReceipt)) return;
    const label =
      agentReceipt.status === 'success'
        ? "Today's daily market created"
        : agentReceipt.status === 'failure'
          ? "Today's daily generation failed"
          : "Today's daily generation complete";
    showConfirmedTransactionToast(hash, label, 'generate-market');
  }, [agentReceipt, hash]);

  const { data: dailyMarket } = useMarket(dailyMarketId ?? undefined);

  // Stepper state derived from on-chain + receipt data.
  const status = dailyMarket?.status;
  const stepSubmitted = isSuccess;
  const stepCreated = newMarketId != null;
  const stepResolving = status === MarketStatus.Resolving;
  const stepResolved = status === MarketStatus.Resolved;

  // Soft-failure detection: agent ignored the [duration=86400] hint. The
  // Market struct has no `createdAt` field, so we can't compute the actual
  // chosen duration precisely — we infer it from `endTime - now` (Open) or
  // show the endTime UTC (Resolving) as the source of truth. v56 (L0)
  // audit fix: trigger the pill in BOTH Open and Resolving so a judge who
  // reloads the page mid-resolution still sees the warning. The 600s slack
  // avoids flagging legitimate 24h markets during the first 10 minutes.
  const endTimeSec = dailyMarket?.endTime ? Number(dailyMarket.endTime) : null;
  const remainingSec = endTimeSec != null ? endTimeSec - Math.floor(Date.now() / 1000) : null;
  const actualDurationIsShort =
    dailyMarket != null &&
    (dailyMarket.status === MarketStatus.Open || dailyMarket.status === MarketStatus.Resolving) &&
    remainingSec != null &&
    remainingSec > 0 &&
    remainingSec < 86400 - 600;
  const endTimeUtc =
    endTimeSec != null ? new Date(endTimeSec * 1000).toUTCString() : null;

  const handleRun = () => {
    if (!isConnected) {
      toast.error('Connect your wallet first');
      return;
    }
    if (!dailyTopic?.topic) {
      toast.error("Today's daily topic is not configured");
      return;
    }
    if (topUpNeeded == null) {
      toast.error('Funding status not loaded yet — try again in a moment');
      return;
    }
    if (dailyMarketId != null) {
      toast.error("Today's market is already on-chain — clear it to re-run");
      return;
    }
    // Compose the topic with the [duration=...] hint so the inference agent
    // can pick the right endTime. Topic length must fit MAX_TOPIC_FOR_AGENT.
    const hint = dailyTopic.durationHint;
    const composed = `${dailyTopic.topic} [duration=${hint}]`.slice(0, MAX_TOPIC_FOR_AGENT);

    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'requestMarketGeneration',
        args: [composed],
        value: topUpNeeded,
      },
      {
        onSuccess: (h) =>
          showSubmittedTransactionToast(h, "Generating today's daily market…", 'generate-market'),
        onError: (err) => toast.error(err.message.slice(0, 140)),
      },
    );
  };

  const clearDailyMarketId = () => {
    setDailyMarketId(null);
    setRequestId(null);
    safeSetLocalStorage(STORAGE_KEY_MARKET, null);
    safeSetLocalStorage(STORAGE_KEY_REQUEST, null);
    toast.info("Today's daily market cleared — you can re-run");
  };

  const topic = dailyTopic?.topic ?? null;
  const dayOfYear = dailyTopic?.dayOfYear;
  const totalTopics = dailyTopic?.totalTopics ?? 0;
  const index = dailyTopic?.index ?? -1;
  const durationHint = dailyTopic?.durationHint ?? 86400;
  const isFundingLoading = topUpNeeded == null && !fundingError;
  const isAgentFailure = agentReceipt?.status === 'failure' && receiptIsComplete(agentReceipt);
  const isRunDisabled =
    !isConnected ||
    isPending ||
    isConfirming ||
    isFundingLoading ||
    topic == null ||
    dailyMarketId != null;

  return (
    <section
      id="daily-resolution-demo"
      className="rounded-2xl border border-violet-400/30 bg-white/5 p-6 backdrop-blur-xl shadow-2xl shadow-black/40 sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Daily Resolution Demo</h2>
          <p className="mt-1 text-sm text-zinc-400">
            One AI-created market per day, 24h duration, fully autonomous resolution.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dayOfYear != null && totalTopics > 0 && (
            <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-200">
              Day {dayOfYear} · topic #{index + 1} of {totalTopics}
            </span>
          )}
          <button
            type="button"
            onClick={() => refetchDailyTopic()}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 transition hover:border-white/20 hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
      </div>

      {topic == null ? (
        <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-sm text-zinc-400">
          No daily topic configured. Add lines to{' '}
          <code className="rounded bg-black/40 px-1">scripts/daily-topics.txt</code>.
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-5 shadow-inner">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-base text-white sm:text-lg">{topic}</p>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                requested: {formatDurationSeconds(durationHint)}
              </span>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Topics may include{' '}
              <code className="rounded bg-black/40 px-1">[duration=N]</code> to hint the agent;
              the actual on-chain endTime is the source of truth.
              <Link
                href="/api/daily-topic"
                target="_blank"
                className="ml-2 text-cyan-300 underline-offset-2 hover:underline"
              >
                /api/daily-topic
              </Link>
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleRun}
              disabled={isRunDisabled}
              className="rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:scale-[1.01] hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
            >
              {isPending || isConfirming
                ? 'Submitting…'
                : dailyMarketId != null
                  ? "Today's market is on-chain"
                  : requestId != null && isAgentFailure
                    ? "Retry today's market"
                    : requestId != null
                      ? "Today's market is generating…"
                      : "Run today's market"}
            </button>
            {(dailyMarketId != null || requestId != null) && (
              <button
                type="button"
                onClick={clearDailyMarketId}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300 transition hover:border-white/20 hover:bg-white/10"
                title="Clear the persisted daily market id and reset the panel"
              >
                Clear / re-run
              </button>
            )}
            <div className="text-xs text-zinc-500">
              Inference deposit:{' '}
              <strong className="text-zinc-300">
                {fundingError ? 'unable to load' : topUpNeeded == null ? '…' : formatStt(topUpNeeded)}
              </strong>
            </div>
          </div>
          <TransactionStatus hash={hash} isConfirming={isConfirming} />

          {isAgentFailure && agentReceipt && (
            <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
              <p className="font-semibold">Agent generation failed</p>
              <p className="mt-1 text-xs text-rose-300/80">
                Status: <code className="rounded bg-black/40 px-1">{agentReceipt.status}</code>
                {agentReceipt.result ? ` · result: ${agentReceipt.result}` : ''}
              </p>
              <button
                type="button"
                onClick={() => {
                  setRequestId(null);
                  toast.info('Cleared requestId — you can retry.');
                }}
                className="mt-3 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-200 transition hover:bg-rose-500/20"
              >
                Retry
              </button>
            </div>
          )}

          {requestId != null && (
            <a
              href={`/receipt/${requestId.toString()}?kind=generation`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block text-center text-xs text-cyan-300 underline-offset-2 hover:underline"
            >
              View live inference receipt (request #{requestId.toString()})
            </a>
          )}
        </>
      )}

      {dailyMarketId != null && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
            <StepDot active={stepSubmitted} label="Submitted" />
            <StepBar active={stepCreated} />
            <StepDot active={stepCreated} label={`Created${newMarketId != null ? ` · #${newMarketId.toString()}` : ''}`} />
            <StepBar active={stepResolving} />
            <StepDot active={stepResolving} label="Resolving" />
            <StepBar active={stepResolved} />
            <StepDot
              active={stepResolved}
              label={dailyMarket && stepResolved ? `Resolved · ${outcomeLabel(dailyMarket.outcome)}` : 'Resolved'}
            />
          </div>

          {actualDurationIsShort && endTimeUtc && (
            <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Agent picked a duration shorter than the requested 24h — the market will resolve
              sooner. endTime: <code className="rounded bg-black/40 px-1">{endTimeUtc}</code>. The
              on-chain endTime is the source of truth.
            </div>
          )}

          {dailyMarket && (
            <div className="mt-5 rounded-xl border border-white/10 bg-black/40 p-5 shadow-inner">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-400">Question</p>
                  <p className="mt-1 text-base text-white">{dailyMarket.question}</p>
                  <p className="mt-2 text-xs text-zinc-500">Source: {dailyMarket.resolutionSource}</p>
                </div>
                <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-200">
                  {statusLabel(dailyMarket.status)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                <span>Creator: {isAgentCreated(dailyMarket.creator) ? 'AI agent' : dailyMarket.creator}</span>
                <span>Ends: {new Date(Number(dailyMarket.endTime) * 1000).toUTCString()}</span>
                {dailyMarket.parseRequestId > 0n && (
                  <a
                    href={`/receipt/${dailyMarket.parseRequestId.toString()}?kind=resolution`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-300 underline-offset-2 hover:underline"
                  >
                    Watch parse receipt
                  </a>
                )}
                {dailyMarket.inferenceRequestId > 0n && (
                  <a
                    href={`/receipt/${dailyMarket.inferenceRequestId.toString()}?kind=resolution`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-300 underline-offset-2 hover:underline"
                  >
                    Watch inference receipt
                  </a>
                )}
                <Link
                  href={`/market/${dailyMarketId.toString()}`}
                  className="text-cyan-300 underline-offset-2 hover:underline"
                >
                  View market
                </Link>
              </div>
              {stepResolved && dailyMarket.outcome && (
                <p className="mt-3 text-sm text-zinc-200">
                  Outcome: <strong className="text-white">{outcomeLabel(dailyMarket.outcome)}</strong>
                </p>
              )}
            </div>
          )}
        </>
      )}

      {storageAvailable === false && (
        <p className="mt-3 text-xs text-amber-300/80">
          localStorage is unavailable — the daily market id will not survive a page reload.
        </p>
      )}
    </section>
  );
}

function StepDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          active
            ? 'h-2.5 w-2.5 rounded-full border border-cyan-400/40 bg-cyan-400/80 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
            : 'h-2.5 w-2.5 rounded-full border border-zinc-700 bg-zinc-900'
        }
      />
      <span className={active ? 'text-zinc-200' : 'text-zinc-500'}>{label}</span>
    </div>
  );
}

function StepBar({ active }: { active: boolean }) {
  return <span className={active ? 'h-px w-6 bg-cyan-400/60' : 'h-px w-6 bg-zinc-700'} />;
}

function outcomeLabel(outcome: boolean | undefined): string {
  return outcome ? 'YES' : 'NO';
}
