'use client';

import { MarketStatus } from '@/lib-web/contract';
import { useMarket } from './useMarkets';

export function useResolutionStatus(marketId: bigint | undefined) {
  const { data: market, isLoading } = useMarket(marketId);

  const isEnded = market ? Date.now() >= Number(market.endTime) * 1000 : false;
  const isResolving = market?.status === MarketStatus.Resolving;
  const isResolved = market?.status === MarketStatus.Resolved;
  const canResolve = market?.status === MarketStatus.Open && isEnded;

  return {
    market,
    isLoading,
    isEnded,
    isResolving,
    isResolved,
    canResolve,
    parseRequestId: market?.parseRequestId,
    inferenceRequestId: market?.inferenceRequestId,
  };
}
