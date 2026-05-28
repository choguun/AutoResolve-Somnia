'use client';

import { use } from 'react';
import { MarketHeader } from '@/components/market/MarketHeader';
import { BetPanel } from '@/components/market/BetPanel';
import { ResolutionPanel } from '@/components/market/ResolutionPanel';
import { OutcomeDisplay, PayoutClaim } from '@/components/market/PayoutClaim';
import { ResolutionTimeline } from '@/components/receipts/ResolutionTimeline';
import { useResolutionStatus } from '@/hooks/useResolutionStatus';
import { MarketStatus } from '@/lib-web/contract';

export default function MarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const marketId = BigInt(id);
  const { market, isLoading, canResolve, isResolving, isResolved, parseRequestId, inferenceRequestId } =
    useResolutionStatus(marketId);
  const hasResolutionRequest = parseRequestId !== undefined && parseRequestId > 0n;

  if (isLoading) {
    return <div className="h-72 animate-pulse rounded-lg border border-white/10 bg-white/5" />;
  }

  if (!market) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-12 text-center">
        <p className="font-medium text-white">Market not found</p>
        <p className="mt-2 text-sm text-zinc-500">This market may not exist on the configured contract.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <MarketHeader market={market} />

      {isResolved && <OutcomeDisplay market={market} />}

      {(isResolving || isResolved || hasResolutionRequest) && (
        <ResolutionTimeline
          status={market.status}
          parseRequestId={parseRequestId}
          inferenceRequestId={inferenceRequestId}
        />
      )}

      {market.status === MarketStatus.Open && !isResolved && (
        <BetPanel marketId={marketId} market={market} />
      )}

      <ResolutionPanel marketId={marketId} canResolve={canResolve} isResolving={isResolving} />

      {isResolved && <PayoutClaim marketId={marketId} market={market} />}
    </div>
  );
}
