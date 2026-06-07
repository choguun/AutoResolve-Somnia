'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useConfig, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { toast } from 'sonner';
import {
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  formatStt,
} from '@/lib-web/contract';
import { useAgentReceipt } from '@/hooks/useAgentReceipt';
import { useMarketCreatedByRequestId } from '@/hooks/useMarketCreatedByRequestId';
import { receiptIsComplete } from '@/lib-web/agents';
import { TransactionStatus } from '@/components/shared/TransactionStatus';
import {
  showConfirmedTransactionToast,
  showSubmittedTransactionToast,
} from '@/lib-web/transactionToast';

const MAX_TOPIC = 200;

export function GenerateMarketForm() {
  const { isConnected } = useAccount();
  const config = useConfig();
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [topUpNeeded, setTopUpNeeded] = useState<bigint | null>(null);
  const [requestId, setRequestId] = useState<bigint | null>(null);
  const [fundingError, setFundingError] = useState<string | null>(null);

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

  // v36 (L0): guard so the "by-tx filter bypassed" toast only fires once per
  // page lifetime, not on every submission. The endpoint is server-side, so
  // a toast per request would be visually noisy without adding signal — the
  // underlying problem (unset NEXT_PUBLIC_CONTRACT_ADDRESS) is operator-side
  // and only one reminder is needed.
  const warnedAboutFilterRef = useRef(false);

  // v16 (M3): use the dedicated `/api/receipt/by-tx/[hash]` endpoint to look up
  // the requestId for the confirmed tx, instead of doing a local event log
  // decode. v15's local decode had two problems: (a) it was duplicated across
  // the contract (event topic computation), the receipt proxy, and the form —
  // easy to drift if the event signature changes; (b) it only matched
  // GenerationRequested, so a multi-call tx (e.g. requestMarketGeneration +
  // any other platform call) would silently miss the requestId. The new
  // endpoint decodes all AutoResolve events in one place and returns
  // `primaryRequestId` (preferring generation over resolution) so the form
  // gets a stable, server-computed answer.
  useEffect(() => {
    if (!isSuccess || !hash) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/receipt/by-tx/${hash}`, { cache: 'no-store' });
        if (!res.ok) {
          // 404 (not yet indexed) or 500 (RPC failure) — both are transient
          // and the user can refresh; log to console for debugging.
          console.warn(
            `[GenerateMarketForm] by-tx lookup failed (status ${res.status}) for ${hash}`,
          );
          return;
        }
        const data = (await res.json()) as {
          primaryRequestId?: string;
          primaryKind?: 'generation' | 'resolution';
          // v36 (L0): false when the server's contract-address log filter
          // was bypassed (NEXT_PUBLIC_CONTRACT_ADDRESS unset). Surface as a
          // one-time warning toast — the server already console.warns, but
          // a user who hits the endpoint via the explorer deep link never
          // sees dev-server logs.
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
          `[GenerateMarketForm] by-tx lookup error for ${hash}:`,
          err instanceof Error ? err.message : err,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuccess, hash]);

  const { data: agentReceipt } = useAgentReceipt(requestId ?? undefined, 'generation');

  // v29 (H2): poll for the MarketCreatedByAgent event matching this requestId
  // so we can auto-redirect to the new market on success. The hook stops on
  // match (marketId found) or when the receipt is a terminal failure (no
  // market will be created). Enabled only while the receipt is still in
  // flight OR has just completed successfully — once it's a failure, the
  // callback never emitted the event and the polling would just burn RPC
  // calls forever.
  const { data: newMarketId } = useMarketCreatedByRequestId(
    requestId,
    !!agentReceipt &&
      (agentReceipt.status !== 'failure' || !receiptIsComplete(agentReceipt)),
  );

  useEffect(() => {
    if (!agentReceipt || !hash) return;
    if (!receiptIsComplete(agentReceipt)) return;
    const label =
      agentReceipt.status === 'success'
        ? 'AI market created'
        : agentReceipt.status === 'failure'
          ? 'AI generation failed'
          : 'AI generation complete';
    showConfirmedTransactionToast(hash, label, 'generate-market');
  }, [agentReceipt, hash]);

  // v29 (H2): auto-redirect to the new market page once the contract has
  // emitted MarketCreatedByAgent for this requestId. The agent receipt
  // confirms "tool_calls" was returned; this event confirms the contract
  // successfully executed createMarket and assigned a marketId. We use
  // router.replace (not push) so the back button takes the user to wherever
  // they came from (typically /proof or /), not to a stale /create form.
  useEffect(() => {
    if (newMarketId == null) return;
    router.replace(`/market/${newMarketId.toString()}`);
  }, [newMarketId, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      toast.error('Connect your wallet first');
      return;
    }
    if (!topic.trim()) {
      toast.error('Enter a topic');
      return;
    }
    if (topUpNeeded == null) {
      toast.error('Funding status not loaded yet — try again in a moment');
      return;
    }

    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'requestMarketGeneration',
        args: [topic.trim()],
        value: topUpNeeded,
      },
      {
        onSuccess: (h) => showSubmittedTransactionToast(h, 'Generating market via AI…', 'generate-market'),
        onError: (err) => toast.error(err.message.slice(0, 140)),
      },
    );
  };

  const topUpDisplay = useMemo(() => {
    if (fundingError) return 'unable to load';
    if (topUpNeeded == null) return '…';
    return formatStt(topUpNeeded);
  }, [fundingError, topUpNeeded]);

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-2xl shadow-black/40 sm:p-8"
    >
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-200">Topic</label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Will the Fed cut rates in 2026?"
          rows={3}
          maxLength={MAX_TOPIC}
          className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition-all duration-300 focus:border-violet-400/50 focus:bg-black/60 focus:ring-4 focus:ring-violet-400/20 shadow-inner"
        />
        <p className="mt-2 text-xs text-zinc-500">
          {topic.length}/{MAX_TOPIC} characters
        </p>
      </div>

      <div className="rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/10 to-transparent p-4 text-sm leading-6 text-zinc-300 shadow-inner">
        A Somnia <strong className="text-white">LLM Inference</strong> validator
        subcommittee will run <code className="rounded bg-black/40 px-1 py-0.5">inferToolsChat</code>{' '}
        and yield{' '}
        <code className="rounded bg-black/40 px-1 py-0.5">
          createMarket(question, source, duration)
        </code>{' '}
        calldata back to this contract. The contract validates and executes the call — markets
        created this way are marked with the <code className="rounded bg-black/40 px-1 py-0.5">AGENT_CREATOR_SENTINEL</code>{' '}
        address. Inference deposit:{' '}
        <strong className="text-white">{topUpDisplay}</strong>.
      </div>

      <button
        type="submit"
        disabled={isPending || isConfirming || topUpNeeded == null}
        className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 px-6 py-3.5 font-bold text-zinc-950 transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_0_25px_rgba(139,92,246,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
      >
        {isPending || isConfirming ? 'Generating…' : 'Generate Market via AI'}
      </button>
      <TransactionStatus hash={hash} isConfirming={isConfirming} />
      {requestId != null && (
        <a
          // v23 (H1): append `?kind=generation` so the receipt page shows the
          // generation copy on the long-running / error path. Without this the
          // page falls back to the resolution copy, which tells the user the
          // wrong thing ("If the market is stuck in Resolving for more than
          // 30 minutes…") for a generation requestId — generation has no
          // on-chain reset and the deposit is non-refundable.
          href={`/receipt/${requestId.toString()}?kind=generation`}
          target="_blank"
          rel="noreferrer"
          className="block text-center text-xs text-cyan-300 underline-offset-2 hover:underline"
        >
          View live inference receipt (request #{requestId.toString()})
        </a>
      )}
    </form>
  );
}
