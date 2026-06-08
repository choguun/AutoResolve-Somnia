'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPublicClient, http } from 'viem';
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { toast } from 'sonner';
import { showConfirmedTransactionToast, showSubmittedTransactionToast } from '@/lib-web/transactionToast';
import { TransactionStatus } from '@/components/shared/TransactionStatus';
import { useGenerationFailures } from '@/hooks/useGenerationFailures';
import { Tooltip } from '@/components/shared/Tooltip';
import {
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  MarketStatus,
  formatCountdown,
  formatStt,
  statusLabel,
} from '@/lib-web/contract';

const proofPublicClient = createPublicClient({
  transport: http('https://dream-rpc.somnia.network'),
});

type AgentMarketContext = {
  marketId: bigint;
  exists: boolean;
  canResolve: boolean;
  status: MarketStatus;
  endTime: bigint;
  totalPool: bigint;
  parseRequestId: bigint;
  inferenceRequestId: bigint;
  requiredDeposit: bigint;
  contractBalance: bigint;
  topUpNeeded: bigint;
  question: string;
  resolutionSource: string;
  parseRequestedAt: bigint;
  inferenceRequestedAt: bigint;
  // v19 (M2): v17 added this bool to the contract's getAgentMarketContext
  // return tuple so external agents can decide whether to call
  // retryInferenceFromCache from a single read. The local type was never
  // updated, so a context read silently dropped the field — the proof
  // page never told operators when a relayer-routable cache was sitting
  // on-chain. The ABI in lib-web/abi.json includes it (auto-generated from
  // the contract), so the runtime value was always present; the type
  // shadow just hid it.
  parseResultCached: boolean;
};

type AgentState = {
  requiredDeposit: bigint;
  contractBalance: bigint;
  topUpNeeded: bigint;
  resolvableIds: bigint[];
  inspectedIds: bigint[];
  nextCursor: bigint;
  contexts: AgentMarketContext[];
};

type GenerationState = {
  requiredDeposit: bigint;
  contractBalance: bigint;
  topUpNeeded: bigint;
  agentCreatedIds: bigint[];
  topics: string[];
};

type RecoveryState = {
  stuckMarketIds: bigint[];
  stuckGenerationIds: bigint[];
};

const INSPECT_FALLBACK_IDS = [6n, 5n, 4n, 3n, 2n, 1n];
const MAX_CONTEXTS = 6;

function uniqueMarketIds(ids: bigint[]): bigint[] {
  const seen = new Set<string>();
  return ids.filter((id) => {
    const key = id.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function latestMarketIds(nextMarketId: bigint): bigint[] {
  const ids: bigint[] = [];
  for (let id = nextMarketId - 1n; id > 0n && ids.length < MAX_CONTEXTS; id -= 1n) {
    ids.push(id);
  }
  return ids;
}

export function AgentCommandCenter() {
  const { isConnected } = useAccount();
  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const queryClient = useQueryClient();
  const [activePipeline, setActivePipeline] = useState<'resolve' | 'generate' | 'recover'>('resolve');
  const [topic, setTopic] = useState('');
  // v33 (H3): per-tx reset tracking. The pre-v33 design used a single
  // `recoveredMarketId` state that was overwritten on every click — if the
  // user clicked "Force reset" on market 1, then quickly clicked "Force reset"
  // on market 2 before market 1's tx confirmed, the success effect at L344
  // would invalidate market 2's `/market/[id]` query (the one captured at
  // effect render time) instead of market 1's. Use a Map<hash, {kind, id}>
  // so each tx's id is captured in the onSuccess closure at click time and
  // matched to its actual hash.
  const [pendingReset, setPendingReset] = useState<
    Map<`0x${string}`, { kind: 'market' | 'generation'; id: bigint }>
  >(() => new Map());
  // v47 (M2): per-tx tracking for the happy-path invocations
  // (requestResolution / requestMarketGeneration). The pre-v47 design
  // captured the success toast only — a judge double-clicking "Invoke
  // Resolver" on market #1 then market #2 saw the same generic toast for
  // whichever hash confirmed first, and the second tx reverted
  // MarketNotOpen. Mirror the v33 H3 pendingReset pattern with a sibling
  // Map: capture the relevant id (marketId for resolve, topic for
  // generate) keyed by the eventual tx hash in onSuccess, then look up
  // by hash in the success effect to invalidate the right query. A
  // separate Map (vs extending pendingReset's kind enum) keeps the
  // reset/invoke responsibilities cleanly separated — the reset path
  // maps id→bigint for both kinds, the invoke path is heterogeneous
  // (resolve: marketId, generate: topic).
  const [pendingInvoke, setPendingInvoke] = useState<
    Map<`0x${string}`, { kind: 'resolve'; marketId: bigint } | { kind: 'generate'; topic: string }>
  >(() => new Map());

  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['agent-command-center'],
    refetchInterval: 10_000,
    queryFn: async (): Promise<AgentState> => {
      const [funding, scan, nextMarketId] = await Promise.all([
        proofPublicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getResolutionFundingStatus',
        }) as Promise<readonly [bigint, bigint, bigint]>,
        proofPublicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'scanResolvableMarkets',
          args: [1n, 10n],
        }) as Promise<readonly [readonly bigint[], bigint]>,
        proofPublicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'nextMarketId',
        }) as Promise<bigint>,
      ]);

      const resolvableIds = [...scan[0]];
      const idsToInspect = uniqueMarketIds([
        ...resolvableIds,
        ...latestMarketIds(nextMarketId),
        ...INSPECT_FALLBACK_IDS,
      ]).slice(0, MAX_CONTEXTS);
      const contexts = (await Promise.all(
        idsToInspect.map((marketId) =>
          proofPublicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getAgentMarketContext',
            args: [marketId],
          }) as Promise<AgentMarketContext>
        )
      )).filter((context) => context.exists);

      return {
        requiredDeposit: funding[0],
        contractBalance: funding[1],
        topUpNeeded: funding[2],
        resolvableIds,
        inspectedIds: idsToInspect,
        nextCursor: scan[1],
        contexts,
      };
    },
  });

  const {
    data: genData,
    refetch: refetchGen,
    isFetching: isGenFetching,
  } = useQuery({
    queryKey: ['agent-command-center-generation'],
    refetchInterval: 10_000,
    queryFn: async (): Promise<GenerationState> => {
      const [funding, scan, topicsRes] = await Promise.all([
        proofPublicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getGenerationFundingStatus',
        }) as Promise<readonly [bigint, bigint, bigint]>,
        proofPublicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'scanAgentCreatedMarkets',
          args: [0n, 10n],
        }) as Promise<readonly [readonly bigint[], bigint]>,
        fetch('/api/topics')
          .then((r) => (r.ok ? r.json() : { topics: [] }))
          .catch(() => ({ topics: [] })),
      ]);
      return {
        requiredDeposit: funding[0],
        contractBalance: funding[1],
        topUpNeeded: funding[2],
        agentCreatedIds: [...scan[0]],
        topics: topicsRes.topics ?? [],
      };
    },
  });

  const {
    data: recoveryData,
    refetch: refetchRecovery,
    isFetching: isRecoveryFetching,
  } = useQuery({
    queryKey: ['agent-command-center-recovery'],
    refetchInterval: 15_000,
    queryFn: async (): Promise<RecoveryState> => {
      // v14: surface the contract's stuck-request recovery interface so any
      // operator (not just the relayer) can force-reset markets and
      // generation requests whose callbacks were dropped by the platform.
      const [stuckMarkets, stuckGen] = await Promise.all([
        proofPublicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'scanStuckMarkets',
          args: [1n, 50n],
        }) as Promise<readonly [readonly bigint[], bigint]>,
        proofPublicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'scanStuckGenerationRequests',
          args: [1n, 50n],
        }) as Promise<readonly [readonly bigint[], bigint]>,
      ]);
      return {
        stuckMarketIds: [...stuckMarkets[0]],
        stuckGenerationIds: [...stuckGen[0]],
      };
    },
  });

  // v24 (M3): the stuck-recovery panel above only surfaces requests where
  // the platform NEVER responded (30+ min timeout). It missed failures where
  // the platform DID respond but with a non-success status — those surface
  // as GenerationFailed events with a descriptive reason ("no-tool-calls",
  // "wrong-selector", "QuestionTooLong", etc.). The hook reads the last
  // ~8 hours of logs (v35 H0 widened to 50_000n, symmetric with
  // useMarketCreatedByRequestId) and decodes the (uint8 status, string
  // reason) data so the panel can tell the user *why* the agent failed
  // and let them re-submit with an adjusted topic.
  const { data: generationFailures, isError: generationFailuresError } = useGenerationFailures();

  const requestResolution = (context: AgentMarketContext) => {
    reset();
    setActivePipeline('resolve');
    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'requestResolution',
        args: [context.marketId],
        value: context.topUpNeeded,
      },
      {
        // v47 (M2): capture (txHash, marketId) in pendingInvoke so the
        // success effect can invalidate the right per-market query even
        // on rapid double-click. Mirrors the v33 H3 pendingReset pattern.
        onSuccess: (txHash) => {
          setPendingInvoke((prev) => {
            const next = new Map(prev);
            next.set(txHash, { kind: 'resolve', marketId: context.marketId });
            return next;
          });
          showSubmittedTransactionToast(
            txHash,
            `Invoking resolver for market #${context.marketId.toString()}...`,
            'agent-resolver'
          );
        },
        onError: (err) => toast.error(err.message.slice(0, 140)),
      }
    );
  };

  const requestGeneration = (rawTopic: string) => {
    const cleanTopic = rawTopic.trim();
    if (!cleanTopic) {
      toast.error('Enter a topic to generate from');
      return;
    }
    if (genData?.topUpNeeded == null) {
      toast.error('Funding status not loaded');
      return;
    }
    reset();
    setActivePipeline('generate');
    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'requestMarketGeneration',
        args: [cleanTopic],
        value: genData.topUpNeeded,
      },
      {
        // v47 (M2): capture (txHash, topic) so the success effect can
        // refetch the generation panel for the specific topic on rapid
        // double-click. Pre-v47, the second click's topic was lost in the
        // shared `activePipeline` state.
        onSuccess: (txHash) => {
          setPendingInvoke((prev) => {
            const next = new Map(prev);
            next.set(txHash, { kind: 'generate', topic: cleanTopic });
            return next;
          });
          showSubmittedTransactionToast(
            txHash,
            `Invoking AI generator for "${cleanTopic.slice(0, 30)}..."`,
            'agent-generator'
          );
        },
        onError: (err) => toast.error(err.message.slice(0, 140)),
      }
    );
  };

  const forceResetMarket = (marketId: bigint) => {
    reset();
    setActivePipeline('recover');
    // v33 (H3): capture the marketId in a Map keyed by the eventual tx hash
    // (set in onSuccess below) so the success effect can match the right
    // id to the right hash, even on rapid double-click.
    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'forceResetMarket',
        args: [marketId],
      },
      {
        onSuccess: (txHash) => {
          setPendingReset((prev) => {
            const next = new Map(prev);
            next.set(txHash, { kind: 'market', id: marketId });
            return next;
          });
          showSubmittedTransactionToast(
            txHash,
            `Force-resetting market #${marketId.toString()}...`,
            'agent-recovery'
          );
        },
        onError: (err) => toast.error(err.message.slice(0, 140)),
      }
    );
  };

  const forceResetGeneration = (requestId: bigint) => {
    reset();
    setActivePipeline('recover');
    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'forceResetGeneration',
        args: [requestId],
      },
      {
        onSuccess: (txHash) => {
          setPendingReset((prev) => {
            const next = new Map(prev);
            next.set(txHash, { kind: 'generation', id: requestId });
            return next;
          });
          showSubmittedTransactionToast(
            txHash,
            `Force-resetting generation request #${requestId.toString()}...`,
            'agent-recovery'
          );
        },
        onError: (err) => toast.error(err.message.slice(0, 140)),
      }
    );
  };

  useEffect(() => {
    if (!isSuccess || !hash) return;
    if (activePipeline === 'resolve') {
      showConfirmedTransactionToast(hash, 'Resolver invoked - agents are working', 'agent-resolver');
      // v47 (M2): look up the (marketId) by the actual hash that confirmed,
      // not by the shared `activePipeline` state. Rapid double-click on
      // two different markets would otherwise invalidate the wrong
      // per-market query (the one captured at effect render time). The
      // /market/[id] page reads `['market', marketId]` and stays stale for
      // up to 5s otherwise — same race the v46 L2 ResolutionPanel close
      // already addressed for the single-market panel view.
      const invoke = pendingInvoke.get(hash);
      if (invoke?.kind === 'resolve') {
        queryClient.invalidateQueries({ queryKey: ['market', invoke.marketId.toString()] });
        // The proof page's scan is also keyed off nextMarketId, so a fresh
        // refetch of the agent-command-center query picks up the status
        // flip on the next render.
        queryClient.invalidateQueries({ queryKey: ['agent-command-center'] });
      }
      setPendingInvoke((prev) => {
        if (!prev.has(hash)) return prev;
        const next = new Map(prev);
        next.delete(hash);
        return next;
      });
    } else if (activePipeline === 'generate') {
      showConfirmedTransactionToast(hash, 'Generation request submitted - agent is thinking', 'agent-generator');
      // v47 (M2): refetch the generation panel for this specific topic
      // on rapid double-click. The generation callback is async (LLM
      // runs, calls back, then createMarket calldata executes), so no
      // market exists yet at tx-success time — invalidating
      // ['agent-command-center-generation'] just makes the 10s polling
      // window feel snappier. The pre-v47 shared `activePipeline` state
      // was single-valued, so the second click's topic was lost.
      const invoke = pendingInvoke.get(hash);
      if (invoke?.kind === 'generate') {
        queryClient.invalidateQueries({ queryKey: ['agent-command-center-generation'] });
        queryClient.invalidateQueries({ queryKey: ['agent-command-center'] });
      }
      setPendingInvoke((prev) => {
        if (!prev.has(hash)) return prev;
        const next = new Map(prev);
        next.delete(hash);
        return next;
      });
    } else {
      showConfirmedTransactionToast(hash, 'Stuck request reset - pipeline is unblocked', 'agent-recovery');
      refetchRecovery();
      // v33 (H3): look up the (kind, id) pair by the actual hash that
      // confirmed, not by a shared `recoveredMarketId` state that gets
      // overwritten on rapid double-click. `kind === 'market'` is the only
      // case that has a `/market/[id]` query to invalidate — generation
      // resets have no associated market.
      const reset = pendingReset.get(hash);
      if (reset?.kind === 'market') {
        queryClient.invalidateQueries({ queryKey: ['market', reset.id.toString()] });
      }
      // Clean up the entry regardless of kind so the Map doesn't grow
      // unbounded over a long session.
      setPendingReset((prev) => {
        if (!prev.has(hash)) return prev;
        const next = new Map(prev);
        next.delete(hash);
        return next;
      });
    }
  }, [hash, isSuccess, activePipeline, refetchRecovery, queryClient, pendingReset, pendingInvoke]);

  const resolveSteps = [
    {
      label: 'Discover',
      detail: data ? `${data.resolvableIds.length} market${data.resolvableIds.length === 1 ? '' : 's'} ready` : 'Scanning',
      active: true,
    },
    {
      label: 'Inspect',
      detail: data
        ? `${data.contexts.length}/${data.inspectedIds.length} context${data.contexts.length === 1 ? '' : 's'} loaded`
        : 'Awaiting RPC',
      active: !!data?.contexts.length,
    },
    {
      label: 'Fund',
      detail: data && data.topUpNeeded === 0n ? 'Funded' : data ? `${formatStt(data.topUpNeeded)} needed` : 'Checking',
      active: data ? data.topUpNeeded === 0n : false,
    },
    {
      label: 'Invoke',
      detail: data?.resolvableIds.length ? 'Ready' : 'Waiting for market close',
      active: !!data?.resolvableIds.length,
    },
  ];

  const generateSteps = [
    {
      label: 'Discover',
      detail: genData ? `${genData.topics.length} topic${genData.topics.length === 1 ? '' : 's'} in queue` : 'Loading',
      active: !!genData?.topics.length,
    },
    {
      label: 'Fund',
      detail: genData && genData.topUpNeeded === 0n ? 'Funded' : genData ? `${formatStt(genData.topUpNeeded)} needed` : 'Checking',
      active: genData ? genData.topUpNeeded === 0n : false,
    },
    {
      label: 'Generate',
      detail: isPending && activePipeline === 'generate' ? 'Submitting' : 'Ready to invoke',
      active: isConnected && genData?.topics.length != null,
    },
    {
      label: 'Verify',
      detail: genData
        ? `${genData.agentCreatedIds.length} AI-created market${genData.agentCreatedIds.length === 1 ? '' : 's'}`
        : 'Awaiting RPC',
      active: !!genData?.agentCreatedIds.length,
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 to-violet-500/5 backdrop-blur-xl shadow-[0_0_40px_rgba(6,182,212,0.15)]">
      <div className="border-b border-white/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
              Live Autonomous Console
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Agent Command Center</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
              A live view of the contract interface an external agent can use to <strong>create</strong> and{' '}
              <strong>resolve</strong> markets without relying on frontend state. Both pipelines use the
              same Somnia LLM Inference agent — <code className="rounded bg-black/40 px-1">inferToolsChat</code>{' '}
              for generation, <code className="rounded bg-black/40 px-1">inferString</code> for resolution.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              refetch();
              refetchGen();
              refetchRecovery();
            }}
            disabled={isFetching || isGenFetching || isRecoveryFetching}
            className="w-full rounded-xl bg-gradient-to-r from-white to-cyan-100 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(255,255,255,0.3)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
          >
            {isFetching || isGenFetching || isRecoveryFetching ? 'Scanning...' : 'Run Agent Scan'}
          </button>
        </div>
      </div>

      <div className="grid gap-5 border-b border-white/10 p-5 sm:p-6 lg:grid-cols-2">
        <PipelineCard
          title="Resolution Pipeline"
          subtitle="Expired markets → Parse Website → LLM Inference → payout"
          steps={resolveSteps}
          accent="cyan"
        />
        <PipelineCard
          title="Generation Pipeline"
          subtitle="Topic → LLM Inference (inferToolsChat) → createMarket calldata → new market"
          steps={generateSteps}
          accent="violet"
        />
      </div>

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white">Resolution Funding</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Required" value={data ? formatStt(data.requiredDeposit) : '...'} />
            <Metric label="Contract Balance" value={data ? formatStt(data.contractBalance) : '...'} />
            <Metric label="Top-Up Needed" value={data ? formatStt(data.topUpNeeded) : '...'} tone={data?.topUpNeeded === 0n ? 'good' : 'warn'} />
          </div>

          <div className="rounded-xl border border-white/5 bg-black/40 p-5 shadow-inner backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-white">Autonomous Call Path (resolve)</h3>
            <div className="mt-3 space-y-2 font-mono text-xs text-zinc-400">
              <p>1. scanResolvableMarkets(1, 10)</p>
              <p>2. getAgentMarketContext(marketId)</p>
              <p>3. requestResolution(marketId)</p>
              <p>4. parse callback -&gt; inference callback -&gt; payout</p>
            </div>
          </div>

          <Link
            href="/api/agent-manifest"
            className="block rounded-xl border border-white/5 bg-black/40 p-4 text-sm font-semibold text-cyan-300 shadow-inner backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-white/5"
          >
            Open machine-readable manifest
          </Link>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white">Generation Console</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Inference Req'd" value={genData ? formatStt(genData.requiredDeposit) : '...'} />
            <Metric label="Contract Balance" value={genData ? formatStt(genData.contractBalance) : '...'} />
            <Metric label="Top-Up Needed" value={genData ? formatStt(genData.topUpNeeded) : '...'} tone={genData?.topUpNeeded === 0n ? 'good' : 'warn'} />
          </div>

          <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 p-5 shadow-inner backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-white">Autonomous Call Path (generate)</h3>
            <div className="mt-3 space-y-2 font-mono text-xs text-zinc-400">
              <p>1. getGenerationFundingStatus()</p>
              <p>2. requestMarketGeneration(topic) {'{ value: topUpNeeded }'}</p>
              <p>3. handleGenerationCallback (LLM yields createMarket calldata)</p>
              <p>4. scanAgentCreatedMarkets(0, 10) -&gt; verify</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-black/40 p-5 shadow-inner backdrop-blur-sm">
            <label className="block text-sm font-semibold text-white">Run a generation</label>
            <p className="mt-1 text-xs text-zinc-400">
              Topics are seeded from <code className="rounded bg-black/40 px-1">scripts/topics.txt</code>.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                id="agent-command-center-generate-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Custom topic (or pick below)"
                maxLength={200}
                className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none transition focus:border-violet-400/40 focus:ring-2 focus:ring-violet-400/20"
              />
              <button
                type="button"
                onClick={() => requestGeneration(topic)}
                disabled={isPending || isConfirming || !isConnected}
                className="rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 px-4 py-2 text-sm font-bold text-zinc-950 transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              >
                {isPending && activePipeline === 'generate' ? 'Submitting…' : 'Invoke Generator'}
              </button>
            </div>
            {genData?.topics && genData.topics.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {genData.topics.slice(0, 6).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => requestGeneration(t)}
                    disabled={isPending || isConfirming || !isConnected}
                    className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200 transition hover:border-violet-400/60 hover:bg-violet-500/20 disabled:opacity-40"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            {genData?.agentCreatedIds && genData.agentCreatedIds.length > 0 && (
              <div className="mt-3 text-xs text-zinc-400">
                AI-created:{' '}
                {genData.agentCreatedIds.map((id, i) => (
                  <span key={id.toString()}>
                    {i > 0 && ', '}
                    <Link href={`/market/${id.toString()}`} className="text-cyan-300 hover:underline">
                      #{id.toString()}
                    </Link>
                  </span>
                ))}
              </div>
            )}
            <TransactionStatus hash={activePipeline === 'generate' ? hash : undefined} isConfirming={activePipeline === 'generate' && isConfirming} />
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-white">Market Contexts (Resolution)</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {data?.contexts.map((context) => (
            <MarketContextCard
              key={context.marketId.toString()}
              context={context}
              isConnected={isConnected}
              isBusy={isPending || isConfirming}
              onResolve={() => requestResolution(context)}
            />
          ))}

          {!isLoading && !data?.contexts.length && (
            <div className="rounded-lg border border-dashed border-white/15 bg-black/20 p-8 text-center text-sm text-zinc-500">
              No markets returned by the resolver scan.
            </div>
          )}
        </div>
        <TransactionStatus
          hash={activePipeline === 'resolve' ? hash : undefined}
          isConfirming={activePipeline === 'resolve' && isConfirming}
        />
      </div>

      <div className="border-t border-white/10 p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Stuck-Request Recovery</h3>
            <p className="mt-1 max-w-2xl text-xs text-zinc-400">
              Live view of the contract&apos;s symmetric recovery surface (
              <code className="rounded bg-black/40 px-1">scanStuckMarkets</code> +
              <code className="rounded bg-black/40 px-1">forceResetMarket</code> /
              <code className="rounded bg-black/40 px-1">scanStuckGenerationRequests</code> +
              <code className="rounded bg-black/40 px-1">forceResetGeneration</code>). A request is
              considered stuck after <strong className="text-white">30 minutes</strong> with no
              platform callback. Anyone can call these — no admin keys, no upgrade path.
            </p>
          </div>
          {recoveryData && (
            <div className="text-xs text-zinc-400">
              {recoveryData.stuckMarketIds.length + recoveryData.stuckGenerationIds.length === 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.8)]" />
                  All requests healthy
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]" />
                  {recoveryData.stuckMarketIds.length + recoveryData.stuckGenerationIds.length} stuck
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-white/5 bg-black/40 p-4 shadow-inner">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Stuck Markets
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
                resolve pipeline
              </span>
            </div>
            {recoveryData?.stuckMarketIds.length ? (
              <ul className="space-y-2">
                {recoveryData.stuckMarketIds.map((marketId) => (
                  <li
                    key={marketId.toString()}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Link
                        href={`/market/${marketId.toString()}`}
                        className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 font-semibold text-amber-200 hover:bg-amber-400/20"
                      >
                        Market #{marketId.toString()}
                      </Link>
                      <span className="text-zinc-500">callback dropped &gt;30m ago</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => forceResetMarket(marketId)}
                      disabled={!isConnected || isPending || isConfirming}
                      className="rounded-lg bg-gradient-to-r from-amber-300 to-orange-200 px-3 py-1.5 text-xs font-bold text-zinc-950 transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                    >
                      {isConnected ? 'Force Reset' : 'Connect Wallet'}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-5 text-center text-xs text-zinc-500">
                No stuck markets — the resolve pipeline is healthy.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/5 bg-black/40 p-4 shadow-inner">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Stuck Generation Requests
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
                create pipeline
              </span>
            </div>
            {recoveryData?.stuckGenerationIds.length ? (
              <ul className="space-y-2">
                {recoveryData.stuckGenerationIds.map((requestId) => (
                  <li
                    key={requestId.toString()}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-400/20 bg-violet-400/5 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Link
                        // v23 (H1): generation receiptId — the viewer branches
                        // its long-running copy on kind, and the generation
                        // copy correctly tells the user the deposit is
                        // non-refundable.
                        href={`/receipt/${requestId.toString()}?kind=generation`}
                        className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 font-semibold text-violet-200 hover:bg-violet-400/20"
                      >
                        Request #{requestId.toString()}
                      </Link>
                      <span className="text-zinc-500">
                        deposit forwarded — not refundable
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => forceResetGeneration(requestId)}
                      disabled={!isConnected || isPending || isConfirming}
                      className="rounded-lg bg-gradient-to-r from-violet-300 to-cyan-200 px-3 py-1.5 text-xs font-bold text-zinc-950 transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                    >
                      {isConnected ? 'Force Reset' : 'Connect Wallet'}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-5 text-center text-xs text-zinc-500">
                No stuck generation requests — the create pipeline is healthy.
              </div>
            )}
          </div>
        </div>

        {/* v24 (M3): recent GenerationFailed events surface here with the
            contract's decoded reason. A "wrong-selector" / "no-tool-calls"
            failure means the topic needs to be re-thought; a "QuestionTooLong"
            / "DurationTooLong" failure means the agent mis-hit the contract's
            own limits. The relayer logs the reason (M1) but operators and
            judges don't watch stdout — this is the in-app view. The "Re-run
            with different topic" button clears the input and scrolls to the
            generation form above; the receipt link lets the user inspect the
            agent's response. Cap at 20 rows; polling is 15s.
            v29 (L1): each row now also shows the original topic (recovered
            from the matching GenerationRequested event's data) so the user
            knows what failed without having to retype from memory. Falls
            back to "(topic not recovered)" when the request is outside the
            scan window. The button still says "different topic" because
            the form clears — re-running with the same failed topic would
            just produce the same failure and burn another inference deposit.
            v26 (L2): when the hook's underlying RPC is failing, the empty
            state ("no failures") was misleading — the user couldn't tell
            whether there were no failures or whether the hook couldn't
            reach the chain. Surface `isError` as a small amber chip in the
            card header and dim the card border so the operator knows the
            data is stale. The relayer (which logs the same failures via
            drainGenerationFailureEvents) is the authoritative source in
            that case — operators can `tail -f relayer.log` to confirm. */}
        <div
          className={`mt-3 rounded-xl border bg-black/40 p-4 shadow-inner ${
            generationFailuresError
              ? 'border-amber-500/30'
              : 'border-white/5'
          }`}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Recent Generation Failures
            </span>
            <div className="flex items-center gap-2">
              {generationFailuresError && (
                <Tooltip content="RPC unavailable — the in-app view may be stale. Check the relayer log (drainGenerationFailureEvents) for the authoritative failure stream.">
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden="true" />
                    RPC unavailable
                  </span>
                </Tooltip>
              )}
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
                last ~8 hours · create pipeline
              </span>
            </div>
          </div>
          {generationFailures && generationFailures.length > 0 ? (
            <ul className="space-y-2">
              {generationFailures.map((failure) => (
                <li
                  key={`${failure.txHash}-${failure.requestId.toString()}`}
                  className="flex flex-col gap-2 rounded-lg border border-rose-400/20 bg-rose-500/5 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    {/* v29 (L1): show the original topic above the reason so the
                        user knows what failed without having to retype from
                        memory. Truncate at 80 chars with a tooltip for the
                        full string. Falls back to "unknown topic" when the
                        GenerationRequested event is outside the scan window
                        (rare — only happens for very old failures). */}
                    {failure.topic ? (
                      <Tooltip content={failure.topic}>
                        <p className="break-words text-sm font-semibold text-rose-100">
                          &ldquo;{failure.topic.length > 80
                            ? `${failure.topic.slice(0, 80)}…`
                            : failure.topic}&rdquo;
                        </p>
                      </Tooltip>
                    ) : (
                      <p className="text-xs italic text-zinc-500">(topic not recovered)</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Link
                        href={`/receipt/${failure.requestId.toString()}?kind=generation`}
                        className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 font-semibold text-rose-200 hover:bg-rose-500/20"
                      >
                        Request #{failure.requestId.toString()}
                      </Link>
                      <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-rose-200/90">
                        {failure.reason}
                      </code>
                      <span className="text-zinc-500">block {failure.blockNumber.toString()}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePipeline('generate');
                      setTopic('');
                      document
                        .getElementById('agent-command-center-generate-input')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    className="shrink-0 rounded-lg border border-rose-300/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-200 transition hover:scale-[1.02] hover:border-rose-300/60 hover:bg-rose-500/20"
                  >
                    Re-run with different topic
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-5 text-center text-xs text-zinc-500">
              {generationFailuresError
                ? 'Could not load recent generation failures — the upstream RPC is unavailable. Check the relayer log for the authoritative stream.'
                : 'No recent generation failures — the agent has returned valid createMarket calls for every request in the last ~8 hours.'}
            </div>
          )}
        </div>

        <TransactionStatus
          hash={activePipeline === 'recover' ? hash : undefined}
          isConfirming={activePipeline === 'recover' && isConfirming}
        />
      </div>
    </section>
  );
}

function PipelineCard({
  title,
  subtitle,
  steps,
  accent,
}: {
  title: string;
  subtitle: string;
  steps: { label: string; detail: string; active: boolean }[];
  accent: 'cyan' | 'violet';
}) {
  const accentClasses =
    accent === 'cyan'
      ? 'border-cyan-400/30 bg-cyan-500/5'
      : 'border-violet-400/30 bg-violet-500/5';
  return (
    <div className={`rounded-2xl border ${accentClasses} p-4 shadow-inner backdrop-blur-sm`}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs text-zinc-400">{subtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((step) => (
          <div
            key={step.label}
            className={`rounded-xl border p-3 shadow-inner transition-colors duration-300 ${
              step.active
                ? 'border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                : 'border-white/5 bg-black/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  step.active ? 'bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.7)]' : 'bg-zinc-600'
                }`}
              />
              <span className="text-xs font-semibold text-white">{step.label}</span>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-400">{step.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/40 p-4 shadow-inner backdrop-blur-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div
        className={`mt-1 font-semibold ${
          tone === 'good' ? 'text-emerald-200' : tone === 'warn' ? 'text-amber-200' : 'text-white'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function MarketContextCard({
  context,
  isConnected,
  isBusy,
  onResolve,
}: {
  context: AgentMarketContext;
  isConnected: boolean;
  isBusy: boolean;
  onResolve: () => void;
}) {
  const isResolvable = context.canResolve;
  const hasRequests = context.parseRequestId > 0n || context.inferenceRequestId > 0n;

  return (
    <div className="rounded-xl border border-white/5 bg-black/40 p-5 shadow-inner backdrop-blur-md transition-all duration-300 hover:bg-white/5 hover:border-cyan-400/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
              Market #{context.marketId.toString()}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs ${
                isResolvable
                  ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                  : 'border-white/10 bg-white/5 text-zinc-400'
              }`}
            >
              {isResolvable ? 'Resolvable' : statusLabel(context.status)}
            </span>
          </div>
          <h4 className="mt-3 line-clamp-2 font-semibold text-white">{context.question || 'Unknown market'}</h4>
          <p className="mt-2 truncate text-xs text-zinc-500">{context.resolutionSource || 'No source'}</p>
        </div>

        <button
          type="button"
          onClick={onResolve}
          disabled={!isResolvable || isBusy || !isConnected}
          className="shrink-0 rounded-xl bg-gradient-to-r from-white to-cyan-100 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(255,255,255,0.3)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          {isBusy ? 'Invoking...' : isConnected ? 'Invoke Resolver' : 'Connect Wallet'}
        </button>
      </div>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-5">
        <MiniMetric label="Closes" value={formatCountdown(context.endTime)} />
        <MiniMetric label="Pool" value={formatStt(context.totalPool)} />
        <MiniMetric label="Top-Up" value={formatStt(context.topUpNeeded)} />
        <MiniMetric label="Requests" value={hasRequests ? `${context.parseRequestId}/${context.inferenceRequestId}` : 'none'} />
        {/* v25 (H2): surface the on-chain parse-result cache. When the parse
            callback succeeded but the inference deposit couldn't be paid
            (InferenceUnderfunded path, v16 M1), the contract caches the
            parse result so a future retryInferenceFromCache call can skip
            the re-parse. The local type already has parseResultCached
            (v19 M2) but the card wasn't rendering it — operators couldn't
            tell which markets were relayer-routable via the cheap path. */}
        <MiniMetric
          label="Cache"
          value={context.parseResultCached ? 'cached ✓' : '—'}
          tone={context.parseResultCached ? 'good' : 'neutral'}
        />
      </div>
    </div>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'neutral' }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/40 p-3 shadow-inner">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</div>
      <div
        className={`mt-1.5 truncate font-bold ${
          tone === 'good' ? 'text-emerald-200' : 'text-zinc-200'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
