'use client';

import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { somniaTestnet } from '@/lib-web/somnia-chain';
import { CONTRACT_ADDRESS } from '@/lib-web/contract';

const RPC_URL = 'https://dream-rpc.somnia.network';
// v29 (H2): emitted by handleGenerationCallback after the createMarket call
// inside the callback succeeds. The contract deletes requestToTopic[requestId]
// unconditionally in the callback, so this event is the only way for the
// frontend to learn the new marketId from off-chain state. Both requestId
// and marketId are indexed, so viem's `args` filter on `event` builds the
// topic filter automatically.
const MARKET_CREATED_BY_AGENT_EVENT = parseAbiItem(
  'event MarketCreatedByAgent(uint256 indexed requestId, uint256 indexed marketId, address indexed proposer)',
);
const SCAN_WINDOW_BLOCKS = 5000n; // ~50 min on Shannon at ~600ms blocks

const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http(RPC_URL),
});

// v29 (H2): the successful generation path surfaces a "View new market #N"
// affordance. The form auto-redirects to /market/[id]; the receipt viewer
// shows a link. Both consumers need a hook that polls for the event matching
// a specific requestId. Stops on match (marketId found) or when the caller
// flips `enabled` to false (typically once the agent receipt is a terminal
// failure — no market will be created). The 5s cadence matches
// useAgentReceipt so both signals land on the same render.
export function useMarketCreatedByRequestId(
  requestId: bigint | null | undefined,
  enabled: boolean = true,
) {
  return useQuery<bigint | null>({
    queryKey: ['marketCreatedByRequestId', CONTRACT_ADDRESS, requestId?.toString()],
    queryFn: async () => {
      if (requestId == null) return null;
      let head: bigint;
      try {
        head = await publicClient.getBlockNumber();
      } catch {
        return null;
      }
      const from = head > SCAN_WINDOW_BLOCKS ? head - SCAN_WINDOW_BLOCKS : 0n;
      let logs;
      try {
        logs = await publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: MARKET_CREATED_BY_AGENT_EVENT,
          args: { requestId },
          fromBlock: from,
          toBlock: head,
        });
      } catch {
        return null;
      }
      if (logs.length === 0) return null;
      // viem decodes the indexed args into a typed object. marketId is
      // indexed but typed as uint256 → bigint.
      const marketId = logs[0].args?.marketId;
      if (marketId == null) return null;
      return marketId;
    },
    refetchInterval: (query) => {
      if (query.state.data != null) return false;
      if (query.state.status === 'error') return false;
      return 5_000;
    },
    refetchIntervalInBackground: false,
    enabled: enabled && requestId != null,
  });
}
