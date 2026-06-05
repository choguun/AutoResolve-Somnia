'use client';

import { MarketStatus, endTimeMs } from '@/lib-web/contract';
import { useMarket } from './useMarkets';

export function useResolutionStatus(marketId: bigint | undefined) {
  const { data: market, isLoading } = useMarket(marketId);

  // v22 (H2): use the shared precision-safe helper. v19 (L2) added the
  // uint32 clamping in formatCountdown but missed this callsite; the
  // unsafe `Number(endTime) * 1000` pattern is latent for any caller
  // piping a >2^53-ms timestamp through it (year 285K+). The contract
  // caps MAX_DURATION to 1 day, so endTime is always within 24h of
  // creation, but the helper is the right single source of truth.
  const isEnded = market ? Date.now() >= endTimeMs(market.endTime) : false;
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
