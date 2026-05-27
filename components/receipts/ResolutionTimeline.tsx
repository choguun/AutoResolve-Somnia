'use client';

import Link from 'next/link';
import { MarketStatus } from '@/lib-web/contract';

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
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-5 sm:p-6">
      <h2 className="mb-5 text-lg font-semibold text-white">Resolution Pipeline</h2>
      <div className="space-y-4">
        {stages.map((stage, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`h-3 w-3 rounded-full ${
                  stage.done
                    ? 'bg-emerald-400'
                    : stage.active
                      ? 'animate-pulse bg-amber-400'
                      : 'bg-zinc-600'
                }`}
              />
              {i < stages.length - 1 && (
                <div className={`mt-1 h-10 w-0.5 ${stage.done ? 'bg-emerald-400/50' : 'bg-zinc-700'}`} />
              )}
            </div>
            <div className="flex-1 pb-4">
              <div className="font-medium text-white">{stage.label}</div>
              <div className="text-sm text-zinc-500">{stage.description}</div>
              {stage.requestId !== undefined && stage.requestId > 0n && (
                <Link
                  href={`/receipt/${stage.requestId.toString()}`}
                  className="mt-2 inline-flex rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-200 transition hover:bg-cyan-400/15"
                >
                  {stage.receiptLabel} #{stage.requestId.toString()}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
