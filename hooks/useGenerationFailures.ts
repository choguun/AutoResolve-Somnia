'use client';

import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, keccak256, toBytes, decodeAbiParameters } from 'viem';
import { somniaTestnet } from '@/lib-web/somnia-chain';
import { CONTRACT_ADDRESS } from '@/lib-web/contract';

const RPC_URL = 'https://dream-rpc.somnia.network';
const GENERATION_FAILED_TOPIC = keccak256(
  toBytes('GenerationFailed(uint256,uint8,string)')
);
const SCAN_WINDOW_BLOCKS = 5000n; // ~50 min on Shannon at ~600ms blocks

const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http(RPC_URL),
});

export type GenerationFailure = {
  requestId: bigint;
  status: number; // ResponseStatus enum (uint8)
  reason: string;
  blockNumber: bigint;
  txHash: `0x${string}`;
};

async function fetchRecentGenerationFailures(): Promise<GenerationFailure[]> {
  let head: bigint;
  try {
    head = await publicClient.getBlockNumber();
  } catch {
    return [];
  }
  const from = head > SCAN_WINDOW_BLOCKS ? head - SCAN_WINDOW_BLOCKS : 0n;

  let rawLogs: Awaited<ReturnType<typeof publicClient.getLogs>>;
  try {
    rawLogs = await publicClient.getLogs({
      address: CONTRACT_ADDRESS,
      fromBlock: from,
      toBlock: head,
    });
  } catch {
    return [];
  }

  const failed = rawLogs.filter(
    (l) => l.topics[0]?.toLowerCase() === GENERATION_FAILED_TOPIC.toLowerCase(),
  );

  const out: GenerationFailure[] = [];
  for (const log of failed) {
    const requestId = BigInt(log.topics[1] ?? 0n);
    let status = 0;
    let reason = 'unknown';
    try {
      const decoded = decodeAbiParameters(
        [{ type: 'uint8' }, { type: 'string' }],
        log.data,
      );
      status = Number(decoded[0]);
      reason = decoded[1] || 'unknown';
    } catch {
      // Malformed log — skip the decode but still surface the requestId.
    }
    out.push({
      requestId,
      status,
      reason,
      blockNumber: log.blockNumber ?? 0n,
      txHash: log.transactionHash ?? '0x',
    });
  }

  // Newest first; cap to the most recent 20 to keep the panel focused.
  out.sort((a, b) => Number(b.blockNumber - a.blockNumber));
  return out.slice(0, 20);
}

// v24 (M3): AgentCommandCenter's recovery panel only surfaces
// scanStuckMarkets + scanStuckGenerationRequests (no platform response for
// 30+ min). It didn't surface GenerationFailed events (the platform
// responded but with `no-tool-calls` / `wrong-selector` / `QuestionTooLong`
// / etc.) — those failures were operator-invisible. This hook reads the
// last ~50 min of GenerationFailed logs and decodes the (uint8 status,
// string reason) data so the UI can show the contract's hint to the
// operator alongside the requestId. Polled every 15s — same cadence as the
// rest of the recovery panel.
export function useGenerationFailures() {
  return useQuery({
    queryKey: ['generationFailures', CONTRACT_ADDRESS],
    queryFn: fetchRecentGenerationFailures,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}
