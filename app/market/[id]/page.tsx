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

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-white/5" />;
  }

  if (!market) {
    return (
      <div className="rounded-xl border border-white/10 p-12 text-center text-zinc-400">
        Market not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MarketHeader market={market} />

      {isResolved && <OutcomeDisplay market={market} />}

      {(isResolving || isResolved || (parseRequestId && parseRequestId > 0n)) && (
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
