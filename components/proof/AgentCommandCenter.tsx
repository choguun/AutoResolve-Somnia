'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http } from 'viem';
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { toast } from 'sonner';
import { showConfirmedTransactionToast, showSubmittedTransactionToast } from '@/lib-web/transactionToast';
import { TransactionStatus } from '@/components/shared/TransactionStatus';
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
  const [activePipeline, setActivePipeline] = useState<'resolve' | 'generate'>('resolve');
  const [topic, setTopic] = useState('');

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
        onSuccess: (txHash) =>
          showSubmittedTransactionToast(
            txHash,
            `Invoking resolver for market #${context.marketId.toString()}...`,
            'agent-resolver'
          ),
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
    if (genData.topUpNeeded === 0n) {
      toast.error('Contract has no inference deposit — top up the contract first');
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
        onSuccess: (txHash) =>
          showSubmittedTransactionToast(
            txHash,
            `Invoking AI generator for "${cleanTopic.slice(0, 30)}..."`,
            'agent-generator'
          ),
        onError: (err) => toast.error(err.message.slice(0, 140)),
      }
    );
  };

  useEffect(() => {
    if (!isSuccess || !hash) return;
    if (activePipeline === 'resolve') {
      showConfirmedTransactionToast(hash, 'Resolver invoked - agents are working', 'agent-resolver');
    } else {
      showConfirmedTransactionToast(hash, 'Generation request submitted - agent is thinking', 'agent-generator');
    }
  }, [hash, isSuccess, activePipeline]);

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
      active: isConnected && (genData?.topUpNeeded ?? 0n) > 0n,
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
            }}
            disabled={isFetching || isGenFetching}
            className="w-full rounded-xl bg-gradient-to-r from-white to-cyan-100 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(255,255,255,0.3)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
          >
            {isFetching || isGenFetching ? 'Scanning...' : 'Run Agent Scan'}
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

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
        <MiniMetric label="Closes" value={formatCountdown(context.endTime)} />
        <MiniMetric label="Pool" value={formatStt(context.totalPool)} />
        <MiniMetric label="Top-Up" value={formatStt(context.topUpNeeded)} />
        <MiniMetric label="Requests" value={hasRequests ? `${context.parseRequestId}/${context.inferenceRequestId}` : 'none'} />
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/40 p-3 shadow-inner">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="mt-1.5 truncate font-bold text-zinc-200">{value}</div>
    </div>
  );
}
