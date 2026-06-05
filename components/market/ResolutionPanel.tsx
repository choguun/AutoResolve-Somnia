'use client';

import { useEffect, useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi';
import { keccak256, toHex } from 'viem';
import { toast } from 'sonner';
import { Bot, Info, Activity, ExternalLink } from 'lucide-react';
import { Tooltip } from '@/components/shared/Tooltip';
import { CONTRACT_ABI, CONTRACT_ADDRESS, formatStt } from '@/lib-web/contract';
import { useResolutionDeposit } from '@/hooks/useMarkets';
import { showConfirmedTransactionToast, showSubmittedTransactionToast } from '@/lib-web/transactionToast';
import { TransactionStatus } from '@/components/shared/TransactionStatus';

// v19 (L1): filter the receipt logs by the ResolutionRequested event
// signature, not just by topic[1] === marketId. v15 added a second indexed
// arg (`stage` as uint8) to the event, but the original decode at lines
// 33-46 of the pre-v19 file ignored topic[0] entirely. A future event
// that puts `marketId` at topic[1] (e.g. an agent-created market variant
// that mirrors the schema) would be matched by accident and surface a
// wrong requestId. Same constant is computed in app/api/receipt/by-tx;
// keeping it in sync is a one-line copy.
const RESOLUTION_REQUESTED_TOPIC = keccak256(
  toHex('ResolutionRequested(uint256,uint256,uint8)'),
);

export function ResolutionPanel({
  marketId,
  canResolve,
  isResolving,
}: {
  marketId: bigint;
  canResolve: boolean;
  isResolving: boolean;
}) {
  const { data: deposit } = useResolutionDeposit();
  const { data: contractBalance } = useBalance({ address: CONTRACT_ADDRESS });
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt } =
    useWaitForTransactionReceipt({ hash });
  const [parseRequestId, setParseRequestId] = useState<bigint | null>(null);

  const poolBalance = contractBalance?.value ?? 0n;
  const topUp =
    deposit && poolBalance < deposit ? deposit - poolBalance : 0n;

  useEffect(() => {
    if (!isSuccess || !receipt) return;
    // Decode ResolutionRequested(uint256 indexed marketId, uint256 indexed requestId, uint8 stage)
    // from the receipt logs so we can deep-link to /receipt/[requestId].
    for (const log of receipt.logs) {
      if (!log.topics[0] || !log.topics[1] || !log.topics[2]) continue;
      if (log.address.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) continue;
      // v19 (L1): require the topic[0] to be ResolutionRequested — a future
      // event from the contract that also has a marketId at topic[1] would
      // otherwise be matched and surface a wrong requestId.
      if (log.topics[0].toLowerCase() !== RESOLUTION_REQUESTED_TOPIC.toLowerCase()) continue;
      const loggedMarketId = BigInt(log.topics[1]);
      if (loggedMarketId !== marketId) continue;
      setParseRequestId(BigInt(log.topics[2]));
      return;
    }
  }, [isSuccess, receipt, marketId]);

  const requestResolution = () => {
    if (!deposit) return;
    setParseRequestId(null);

    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'requestResolution',
        args: [marketId],
        value: topUp,
      },
      {
        onSuccess: (txHash) =>
          showSubmittedTransactionToast(txHash, 'Requesting autonomous resolution...', 'request-resolution'),
        onError: (err) => toast.error(err.message.slice(0, 120)),
      }
    );
  };

  useEffect(() => {
    if (isSuccess) {
      showConfirmedTransactionToast(hash, 'Resolution requested - agents are working', 'request-resolution');
    }
  }, [hash, isSuccess]);

  if (isResolving) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 backdrop-blur-md shadow-[0_0_20px_rgba(245,158,11,0.15)] sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/20">
            <Activity className="h-5 w-5 animate-pulse text-amber-400" />
          </div>
          <div>
            <h2 className="font-semibold text-amber-200 text-lg">Autonomous Resolution In Progress</h2>
            <p className="text-sm text-zinc-400">
              Somnia agents are scraping the web and classifying the outcome...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!canResolve) return null;

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-6 backdrop-blur-md shadow-xl shadow-black/20 sm:p-8">
      <div className="mb-2 flex items-center gap-2">
        <Bot className="h-5 w-5 text-cyan-300" />
        <h2 className="text-lg font-semibold text-cyan-100">Request Autonomous Resolution</h2>
      </div>
      <p className="mb-4 max-w-3xl text-sm leading-6 text-zinc-400">
        Trigger the two-stage Somnia agent pipeline: web scrape → YES/NO classification.
        Validators reach byte-identical consensus on the result.
      </p>
      {deposit && (
        <div className="mb-6 rounded-xl border border-white/5 bg-black/40 px-5 py-4 text-sm text-zinc-300 shadow-inner backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Agent cost:</span>
            <span className="font-mono font-semibold text-white">{formatStt(deposit)}</span>
            <Tooltip content="Agents require a deposit to process the resolution. This goes to the validators executing the request.">
              <Info className="h-3.5 w-3.5 cursor-help text-zinc-500 hover:text-zinc-300 transition-colors" />
            </Tooltip>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span>Pool: {formatStt(poolBalance)}</span>
            {topUp > 0n && (
              <span className="text-amber-200/80">Top-up from wallet: {formatStt(topUp)}</span>
            )}
          </div>
        </div>
      )}
      <button
        onClick={requestResolution}
        disabled={isPending || isConfirming || !deposit}
        className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-white to-cyan-100 px-6 py-3.5 font-bold text-zinc-950 shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
      >
        {isPending || isConfirming ? 'Submitting...' : 'Request Resolution'}
      </button>
      <TransactionStatus hash={hash} isConfirming={isConfirming} />
      {parseRequestId != null && (
        <a
          href={`/receipt/${parseRequestId.toString()}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-cyan-300 underline-offset-2 hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Watch live parse receipt (request #{parseRequestId.toString()})
        </a>
      )}
    </div>
  );
}
