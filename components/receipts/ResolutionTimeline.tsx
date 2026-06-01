'use client';

import Link from 'next/link';
import { MarketStatus } from '@/lib-web/contract';
import { CopyButton } from '@/components/shared/CopyButton';

export function ResolutionTimeline({
  status,
  parseRequestId,
  inferenceRequestId,
}: {
  status: MarketStatus;
  parseRequestId?: bigint;
  inferenceRequestId?: bigint;
}) {
  const stages = [
    {
      label: 'Stage 1: Web Scrape',
      description: 'LLM Parse Website agent extracts evidence',
      receiptLabel: 'Parse validator receipt',
      requestId: parseRequestId,
      done: status === MarketStatus.Resolved || (inferenceRequestId !== undefined && inferenceRequestId > 0n),
      active: status === MarketStatus.Resolving && parseRequestId !== undefined && parseRequestId > 0n && (!inferenceRequestId || inferenceRequestId === 0n),
    },
    {
      label: 'Stage 2: Classification',
      description: 'LLM Inference agent resolves YES or NO',
      receiptLabel: 'Inference validator receipt',
      requestId: inferenceRequestId,
      done: status === MarketStatus.Resolved,
      active: status === MarketStatus.Resolving && inferenceRequestId !== undefined && inferenceRequestId > 0n,
    },
    {
      label: 'Market Resolved',
      description: 'Outcome recorded on-chain',
      receiptLabel: undefined,
      requestId: undefined,
      done: status === MarketStatus.Resolved,
      active: false,
    },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-2xl shadow-black/20 sm:p-8">
      <h2 className="mb-6 text-xl font-bold text-white drop-shadow-sm">Resolution Pipeline</h2>
      <div className="space-y-4">
        {stages.map((stage, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`h-4 w-4 rounded-full border-2 border-[#090b10] shadow-[0_0_10px_rgba(0,0,0,0.5)] ${
                  stage.done
                    ? 'bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.4)]'
                    : stage.active
                      ? 'animate-pulse bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.4)]'
                      : 'bg-zinc-700'
                }`}
              />
              {i < stages.length - 1 && (
                <div className={`mt-2 h-12 w-0.5 rounded-full ${stage.done ? 'bg-emerald-400/50 shadow-[0_0_10px_rgba(52,211,153,0.3)]' : 'bg-zinc-700/50'}`} />
              )}
            </div>
            <div className="flex-1 pb-4">
              <div className="font-medium text-white">{stage.label}</div>
              <div className="text-sm text-zinc-500">{stage.description}</div>
              {stage.requestId !== undefined && stage.requestId > 0n && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/receipt/${stage.requestId.toString()}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-200 transition hover:bg-cyan-400/15"
                  >
                    {stage.receiptLabel} #{stage.requestId.toString()}
                  </Link>
                  <CopyButton value={stage.requestId.toString()} label="Copy request ID" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
