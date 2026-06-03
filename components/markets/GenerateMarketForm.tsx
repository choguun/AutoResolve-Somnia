'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, useConfig, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { decodeEventLog, keccak256, toBytes } from 'viem';
import { toast } from 'sonner';
import {
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  formatStt,
} from '@/lib-web/contract';
import { useAgentReceipt } from '@/hooks/useAgentReceipt';
import { receiptIsComplete } from '@/lib-web/agents';
import { TransactionStatus } from '@/components/shared/TransactionStatus';
import {
  showConfirmedTransactionToast,
  showSubmittedTransactionToast,
} from '@/lib-web/transactionToast';

const MAX_TOPIC = 200;
const GENERATION_REQUESTED_SIG = keccak256(toBytes('GenerationRequested(uint256,string)'));

export function GenerateMarketForm() {
  const { isConnected } = useAccount();
  const config = useConfig();
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
  const { isLoading: isConfirming, isSuccess, data: receipt } =
    useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (!isSuccess || !receipt) return;
    for (const log of receipt.logs) {
      if (log.topics[0]?.toLowerCase() !== GENERATION_REQUESTED_SIG.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: [
            {
              type: 'event',
              name: 'GenerationRequested',
              inputs: [
                { type: 'uint256', name: 'requestId', indexed: true },
                { type: 'string', name: 'topic' },
              ],
            },
          ],
          data: log.data,
          topics: log.topics,
        });
        setRequestId(BigInt((decoded.args as { requestId: bigint }).requestId));
        return;
      } catch {
        // skip non-matching logs
      }
    }
  }, [isSuccess, receipt]);

  const { data: agentReceipt } = useAgentReceipt(requestId ?? undefined);

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
          href={`/receipt/${requestId.toString()}`}
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
