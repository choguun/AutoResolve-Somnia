'use client';

import Link from 'next/link';
import { useAgentReceipt } from '@/hooks/useAgentReceipt';
import { receiptExplorerUrl, txExplorerUrl } from '@/lib-web/agents';

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

export function AgentReceiptViewer({ requestId }: { requestId: string }) {
  const { data: receipt, isLoading, error } = useAgentReceipt(requestId);

  if (isLoading) return <ReceiptSkeleton />;
  if (error || !receipt) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.045] p-6">
        <p className="font-medium text-white">Receipt not available yet.</p>
        <p className="mt-2 text-xs text-zinc-600">Request ID: {requestId}</p>
        <Link
          href={receiptExplorerUrl(requestId)}
          target="_blank"
          className="mt-4 inline-flex rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200 transition hover:bg-cyan-400/15"
        >
          View in Agent Explorer
        </Link>
      </div>
    );
  }

  const nodes = receipt.subcommittee?.nodes || [];
  const steps = receipt.steps || [];
  const hasError = steps.some((step) => step.name === 'error');
  const status = receipt.status || (hasError ? 'failure' : receipt.result ? 'success' : 'pending');

  return (
    <div className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-2xl shadow-black/40 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-2xl font-bold text-white drop-shadow-sm">Execution Receipt</h3>
        <StatusBadge status={status} />
      </div>

      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div>
          <span className="text-zinc-500">Agent:</span>{' '}
          <span className="text-white">{receipt.agentName || receipt.agentId || 'Unknown'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Request ID:</span>{' '}
          <span className="font-mono text-white">{receipt.requestId || requestId}</span>
        </div>
      </div>

      {steps.length > 0 && (
        <div>
          <h4 className="mb-2 text-lg font-semibold text-white">Execution Steps</h4>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="rounded-xl border border-white/5 bg-black/40 p-4 text-sm shadow-inner backdrop-blur-sm transition-all hover:bg-black/60">
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
          <h4 className="mb-2 text-lg font-semibold text-white">
            Validator Consensus ({receipt.subcommittee?.size ?? nodes.length} nodes)
          </h4>
          <div className="space-y-2">
            {nodes.map((node, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/40 p-4 text-sm shadow-inner backdrop-blur-sm transition-all hover:bg-black/60"
              >
                <span className="font-mono text-xs text-zinc-400">
                  {node.address?.slice(0, 10)}...
                </span>
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

      {receipt.payload && (
        <div>
          <h4 className="mb-2 text-lg font-semibold text-white">Agent Payload</h4>
          <pre className="overflow-x-auto rounded-xl border border-white/5 bg-black/40 p-4 text-xs text-zinc-300 shadow-inner backdrop-blur-sm">
            {JSON.stringify(receipt.payload, null, 2)}
          </pre>
        </div>
      )}

      {receipt.result && (
        <div>
          <h4 className="mb-2 text-lg font-semibold text-white">Result</h4>
          <div className="rounded-xl border border-white/5 bg-black/40 p-4 font-mono text-emerald-300 break-all shadow-inner backdrop-blur-sm">
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
        {receipt.blockNumber && <span>Block: {receipt.blockNumber}</span>}
        <Link href={receiptExplorerUrl(requestId)} target="_blank" className="text-cyan-300 transition hover:text-cyan-200">
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
    </div>
  );
}
