'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ExternalLink, Wand2 } from 'lucide-react';
import { useAgentReceipt } from '@/hooks/useAgentReceipt';
import {
  receiptExplorerUrl,
  receiptIsComplete,
  txExplorerUrl,
} from '@/lib-web/agents';
import { Tooltip } from '@/components/shared/Tooltip';
import { CopyButton } from '@/components/shared/CopyButton';

function StatusBadge({ status }: { status?: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-500/20 text-amber-300',
    success: 'bg-emerald-500/20 text-emerald-300',
    failure: 'bg-rose-500/20 text-rose-300',
  };
  const style = styles[status || ''] || 'bg-zinc-500/20 text-zinc-300';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase ${style}`}>
      {status || 'ready'}
    </span>
  );
}

function ReceiptSkeleton() {
  return (
    <div className="animate-pulse space-y-4 rounded-lg border border-white/10 bg-white/5 p-6">
      <div className="h-6 w-48 rounded bg-white/10" />
      <div className="h-32 rounded bg-white/10" />
      <div className="h-24 rounded bg-white/10" />
    </div>
  );
}

function ConsensusRing({
  value,
  total,
  size = 56,
}: {
  value: number;
  total: number;
  size?: number;
}) {
  const safeTotal = Math.max(total, 1);
  const ratio = Math.max(0, Math.min(1, value / safeTotal));
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;
  const unanimous = value === total && total > 0;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={unanimous ? 'rgb(52 211 153)' : 'rgb(251 191 36)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          fill="none"
          style={{ transition: 'stroke-dasharray 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-sm font-bold ${unanimous ? 'text-emerald-300' : 'text-amber-300'}`}>
          {value}/{total}
        </span>
      </div>
    </div>
  );
}

function formatElapsed(ms?: number): string | null {
  if (ms === undefined || ms === null) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function tokenize(s: string): string[] {
  return s
    .split(/(\s+|[,.;:()\[\]{}"`])/g)
    .filter((t) => t.length > 0);
}

function diffTokens(a: string, b: string) {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  const aHtml = aTokens
    .map((t) =>
      bSet.has(t)
        ? `<span>${escapeHtml(t)}</span>`
        : `<span class="bg-rose-500/20 text-rose-200 rounded px-0.5">${escapeHtml(t)}</span>`
    )
    .join('');
  const bHtml = bTokens
    .map((t) =>
      aSet.has(t)
        ? `<span>${escapeHtml(t)}</span>`
        : `<span class="bg-emerald-500/20 text-emerald-200 rounded px-0.5">${escapeHtml(t)}</span>`
    )
    .join('');
  return { aHtml, bHtml };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function AgentReceiptViewer({
  requestId,
  kind = 'resolution',
}: {
  requestId: string;
  kind?: 'resolution' | 'generation';
}) {
  const { data: receipt, isLoading, error, isLongRunning, refetch, isFetching } = useAgentReceipt(requestId, kind);
  const [compareOpen, setCompareOpen] = useState(false);

  const nodes = useMemo(() => receipt?.subcommittee?.nodes || [], [receipt]);
  const allOutputsIdentical = useMemo(() => {
    if (nodes.length < 2) return true;
    const first = nodes[0]?.output;
    return nodes.every((n) => n.output === first);
  }, [nodes]);

  if (isLoading) return <ReceiptSkeleton />;
  if (error || !receipt) {
    // v14: branch the copy on receipt kind. Resolution receipts gate real
    // on-chain payouts (a stuck receipt means a market is stuck in
    // Resolving), so the message points users to the operator recovery
    // path. Generation receipts are advisory — the deposit was forwarded
    // and isn't refundable, so the message reflects that.
    const errWithStatus = error as (Error & { status?: number; upstreamStatus?: number }) | null;
    const upstreamStatus = errWithStatus?.upstreamStatus;
    const isPlatform5xx =
      upstreamStatus !== undefined && upstreamStatus >= 500 && upstreamStatus < 600;
    const isRateLimited = upstreamStatus === 429;
    const isNotFound = errWithStatus?.status === 404;

    let message: string;
    if (isNotFound) {
      message = 'This request ID isn’t known to the receipt service. The link may be stale.';
    } else if (isPlatform5xx) {
      message = 'The Somnia agent platform is currently unavailable. Receipts will resume when it recovers.';
    } else if (isRateLimited) {
      message = 'Receipt service is throttling requests — retrying shortly.';
    } else if (isLongRunning) {
      message =
        kind === 'generation'
          ? 'The generation receipt is taking longer than expected. The inference deposit was forwarded to the platform and is not refundable — the market may simply not be created.'
          : 'This receipt is taking longer than expected. If the market is stuck in Resolving for more than 30 minutes, the contract surfaces a force-reset path on the proof page.';
    } else {
      message =
        kind === 'generation'
          ? 'Generation receipt not available yet.'
          : 'Receipt not available yet.';
    }
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.045] p-6">
        <p className="font-medium text-white">{message}</p>
        <p className="mt-2 text-xs text-zinc-600">Request ID: {requestId}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <Link
            href={receiptExplorerUrl(requestId)}
            target="_blank"
            className="inline-flex rounded-lg border border-violet-400/20 bg-violet-400/10 px-4 py-2 text-sm text-violet-200 transition hover:bg-violet-400/15"
          >
            View in Agent Explorer
          </Link>
        </div>
      </div>
    );
  }

  const steps = receipt.steps || [];
  const totalNodes = receipt.subcommittee?.size ?? nodes.length;
  const respondingNodes = nodes.filter((n) => n.output !== undefined && n.output !== '').length;
  const hasError = steps.some((step) => step.name === 'error');
  const status = receipt.status || (hasError ? 'failure' : receipt.result ? 'success' : 'pending');
  const elapsed = formatElapsed(receipt.elapsedMs);
  const explorerUrl = receiptExplorerUrl(receipt.requestId || requestId);

  return (
    <div className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-2xl shadow-black/40 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-2xl font-bold text-white drop-shadow-sm">Execution Receipt</h3>
        <div className="flex items-center gap-3">
          <Tooltip content="Open Agent Explorer in a new tab">
            <Link
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition hover:border-cyan-400/30 hover:bg-white/10"
              aria-label="Open in Agent Explorer"
            >
              <QRCodeSVG
                value={explorerUrl}
                size={36}
                bgColor="transparent"
                fgColor="#a5f3fc"
                level="M"
              />
            </Link>
          </Tooltip>
          <StatusBadge status={status} />
          {receipt._source === 'fallback' && (
            <Tooltip content="Primary host returned 5xx; this data was served by the alternate agent host.">
              <span
                className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-200"
                aria-label="Served via fallback host"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" aria-hidden="true" />
                via fallback
              </span>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">Agent:</span>
          <span className="text-white">{receipt.agentName || receipt.agentId || 'Unknown'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">Request ID:</span>
          <span className="font-mono text-white">{receipt.requestId || requestId}</span>
          <CopyButton value={receipt.requestId || requestId} label="Copy request ID" />
        </div>
        {receipt.blockNumber !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">Block:</span>
            <span className="font-mono text-white">{receipt.blockNumber.toString()}</span>
          </div>
        )}
        {receipt.txHash && (
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">Tx:</span>
            <a
              href={txExplorerUrl(receipt.txHash)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-cyan-300 transition hover:text-cyan-200"
            >
              {receipt.txHash.slice(0, 10)}...{receipt.txHash.slice(-8)}
            </a>
            <CopyButton value={receipt.txHash} label="Copy tx hash" />
          </div>
        )}
      </div>

      {/* v27 (H1): the polling cap in useAgentReceipt used to silently stop
          at 5 min, leaving the user on a partial-data success path with no
          "polling paused" cue and no Refresh button (the error path was
          the only place that surfaced one). The cap is gone — polling
          continues — but we still surface a hint once the elapsed time
          crosses the threshold, so the user knows the pipeline is slow
          and can manually re-engage if they don't want to wait. The copy
          branches on receipt kind: generation receipts carry an
          unrecoverable inference deposit, while resolution receipts point
          to the on-chain force-reset path after 30 min. */}
      {isLongRunning && !receiptIsComplete(receipt) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 shadow-inner backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-sm leading-6 text-amber-100">
              <p className="font-semibold text-amber-200">This receipt is taking longer than expected.</p>
              <p className="mt-1 text-amber-100/80">
                {kind === 'generation'
                  ? 'The inference deposit was forwarded to the platform and is not refundable — the market may simply not be created. We are still polling; click Refresh to manually re-check.'
                  : 'We are still polling the receipt service. If the market stays in Resolving for more than 30 minutes, the contract surfaces a force-reset path on the proof page.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex shrink-0 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-200 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      )}

      {steps.length > 0 && (
        <div>
          <h4 className="mb-2 text-lg font-semibold text-white">Execution Steps</h4>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/5 bg-black/40 p-4 text-sm shadow-inner backdrop-blur-sm transition-all hover:bg-black/60"
                style={{
                  animation: `slideIn 400ms ease-out ${i * 80}ms backwards`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-violet-300">{step.name || 'step'}</span>
                  {step.duration_ms !== undefined && (
                    <span className="text-emerald-400">{step.duration_ms}ms</span>
                  )}
                </div>
                {step.function && (
                  <p className="mt-1 font-mono text-xs text-zinc-400">fn: {step.function}</p>
                )}
                {step.url && <p className="mt-1 truncate text-xs text-cyan-400">{step.url}</p>}
                {step.message && <p className="mt-1 text-xs text-rose-300">{step.message}</p>}
                {step.content && (
                  <p className="mt-1 font-mono text-xs text-emerald-400 break-all">{step.content}</p>
                )}
                {step.output && !step.content && (
                  <p className="mt-1 font-mono text-xs text-emerald-400 break-all">
                    {String(step.output)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {nodes.length > 0 && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h4 className="text-lg font-semibold text-white">Validator Consensus</h4>
              <ConsensusRing value={respondingNodes} total={totalNodes} />
              {elapsed && (
                <span
                  className={`rounded-md px-2 py-0.5 font-mono text-xs ${
                    allOutputsIdentical
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }`}
                >
                  consensus in {elapsed}
                </span>
              )}
            </div>
            {nodes.length >= 2 && (
              <button
                type="button"
                onClick={() => setCompareOpen((v) => !v)}
                aria-expanded={compareOpen}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300 transition hover:border-cyan-400/30 hover:text-cyan-200"
              >
                {compareOpen ? 'Hide' : 'Compare'} validators
              </button>
            )}
          </div>
          <div className="space-y-2">
            {nodes.map((node, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/40 p-4 text-sm shadow-inner backdrop-blur-sm transition-all hover:bg-black/60"
                style={{
                  animation: `slideIn 400ms ease-out ${i * 60}ms backwards`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-zinc-400">
                    {node.address
                      ? `${node.address.slice(0, 10)}...${node.address.slice(-6)}`
                      : `node-${i + 1}`}
                  </span>
                  {node.address && <CopyButton value={node.address} label="Copy validator address" />}
                </div>
                {node.executionTimeMs !== undefined && (
                  <span className="text-emerald-400">{node.executionTimeMs}ms</span>
                )}
                {node.output && (
                  <span className="max-w-xs truncate font-mono text-xs text-cyan-400">
                    {node.output}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {compareOpen && nodes.length >= 2 && (
        <div>
          <h4 className="mb-2 text-lg font-semibold text-white">Compare Validator Outputs</h4>
          {allOutputsIdentical ? (
            <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              All {nodes.length} validators returned the same output. Unanimous consensus.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div
                className="grid gap-2 text-xs"
                style={{ gridTemplateColumns: `repeat(${nodes.length}, minmax(0, 1fr))` }}
              >
                {nodes.map((node, i) => {
                  const others = nodes
                    .filter((_, j) => j !== i)
                    .map((n) => n.output ?? '')
                    .join('\n');
                  const { aHtml, bHtml } = diffTokens(node.output ?? '', others);
                  return (
                    <div
                      key={i}
                      className="rounded-xl border border-white/5 bg-black/40 p-3 font-mono"
                    >
                      <div className="mb-2 flex items-center justify-between text-zinc-400">
                        <span>Node {i + 1}</span>
                        {node.executionTimeMs !== undefined && (
                          <span className="text-emerald-400">{node.executionTimeMs}ms</span>
                        )}
                      </div>
                      <div
                        className="whitespace-pre-wrap break-words text-cyan-200"
                        dangerouslySetInnerHTML={{ __html: aHtml }}
                      />
                      {aHtml !== bHtml && (
                        <details className="mt-3 border-t border-white/5 pt-2 text-zinc-500">
                          <summary className="cursor-pointer text-[10px] uppercase tracking-wide">
                            vs others
                          </summary>
                          <div
                            className="mt-1 whitespace-pre-wrap break-words text-emerald-200/80"
                            dangerouslySetInnerHTML={{ __html: bHtml }}
                          />
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-500">
                <span className="rounded bg-rose-500/20 px-1 text-rose-200">rose</span> tokens only in this
                node,{' '}
                <span className="rounded bg-emerald-500/20 px-1 text-emerald-200">green</span> tokens only in
                others.
              </p>
            </div>
          )}
        </div>
      )}

      {receipt.payload && (
        <div>
          <h4 className="mb-2 text-lg font-semibold text-white">Agent Payload</h4>
          <pre className="overflow-x-auto rounded-xl border border-white/5 bg-black/40 p-4 text-xs text-zinc-300 shadow-inner backdrop-blur-sm">
            {JSON.stringify(receipt.payload, null, 2)}
          </pre>
        </div>
      )}

      {/* v24 (H1): for a generation receipt, surface the agent's
          createMarket call (decoded from the response_encoded step's
          pendingToolCalls). This is the actual deliverable — without
          this panel the viewer only shows the model narration or the
          raw hex blob, and a judge can't verify the question/source/
          duration the agent designed. The panel only renders for
          generation receipts that actually contained a createMarket
          call (i.e. finishReason === 'tool_calls' and the first
          matching call decoded successfully). */}
      {kind === 'generation' && receipt.generationToolCall && (
        <div className="rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 to-violet-500/5 p-5 shadow-inner backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-lg font-semibold text-cyan-100">
              <Wand2 className="h-4 w-4" />
              Agent Designed Market
            </h4>
            <Tooltip content="Decoded from the agent's createMarket calldata in pendingToolCalls. The contract executes the first matching call; any duplicates emit a DuplicateToolCall advisory.">
              <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
                decoded from receipt
              </span>
            </Tooltip>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl border border-white/5 bg-black/40 p-4 shadow-inner">
              <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Question</dt>
              <dd className="mt-1.5 font-semibold text-white break-words">
                {receipt.generationToolCall.question}
              </dd>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/40 p-4 shadow-inner">
              <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Source</dt>
              <dd className="mt-1.5 break-all">
                <a
                  href={receipt.generationToolCall.source}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-cyan-300 transition hover:text-cyan-100"
                >
                  {receipt.generationToolCall.source}
                  <ExternalLink className="h-3 w-3 opacity-70" />
                </a>
              </dd>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/40 p-4 shadow-inner">
              <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Duration</dt>
              <dd className="mt-1.5 font-semibold text-white">
                {Number(receipt.generationToolCall.durationSeconds)}s
                {Number(receipt.generationToolCall.durationSeconds) === 300
                  ? ' (5 min, demo default)'
                  : null}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-zinc-500">
            Raw createMarket calldata:{' '}
            <code className="break-all rounded bg-black/40 px-1.5 py-0.5 font-mono text-cyan-200/80">
              {receipt.generationToolCall.rawCalldata.slice(0, 10)}…
            </code>
            <CopyButton value={receipt.generationToolCall.rawCalldata} label="Copy raw calldata" />
          </p>
        </div>
      )}

      {receipt.result && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-lg font-semibold text-white">Result</h4>
            <CopyButton value={receipt.result} label="Copy result" />
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 font-mono text-lg text-emerald-300 break-all shadow-inner backdrop-blur-sm">
            {receipt.result}
          </div>
        </div>
      )}

      {steps.length === 0 && !receipt.result && !receipt.payload && (
        <div>
          <h4 className="mb-2 text-lg font-semibold text-white">Raw Receipt</h4>
          <pre className="overflow-x-auto rounded-xl border border-white/5 bg-black/40 p-4 text-xs text-zinc-300 shadow-inner backdrop-blur-sm">
            {JSON.stringify(receipt, null, 2)}
          </pre>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
        <Link href={explorerUrl} target="_blank" rel="noreferrer" className="text-cyan-300 transition hover:text-cyan-200">
          Open in Agent Explorer
        </Link>
        {receipt.txHash && (
          <a
            href={txExplorerUrl(receipt.txHash)}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-300 transition hover:text-cyan-200"
          >
            View on Shannon Explorer
          </a>
        )}
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-12px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
