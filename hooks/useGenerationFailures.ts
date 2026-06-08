'use client';

import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, keccak256, toBytes, decodeAbiParameters } from 'viem';
import { somniaTestnet } from '@/lib-web/somnia-chain';
import { CONTRACT_ADDRESS } from '@/lib-web/contract';

const RPC_URL = 'https://dream-rpc.somnia.network';
const GENERATION_FAILED_TOPIC = keccak256(
  toBytes('GenerationFailed(uint256,uint8,string)')
);
// v29 (L1): emitted by requestMarketGeneration. The contract deletes
// requestToTopic[requestId] unconditionally at the top of
// handleGenerationCallback, so the topic is GONE by the time the
// GenerationFailed event is observed. We recover the topic from the
// GenerationRequested event's data (the topic field is non-indexed, so it
// lives in log.data as the abi.encode(string) of the topic).
const GENERATION_REQUESTED_TOPIC = keccak256(
  toBytes('GenerationRequested(uint256,string)')
);
// v35 (H0): bumped 5000n → 50_000n to match useMarketCreatedByRequestId
// (v33 H2). 50_000n covers ~8.3 hours on Shannon at ~600ms blocks, which
// closes a residual asymmetry: a slow LLM pipeline (60+ min) that eventually
// emitted a GenerationFailed event used to fall OUT of this hook's scan
// window before the auto-redirect hook (the one that creates markets) saw
// the corresponding MarketCreatedByAgent event. The two hooks are now
// symmetric — the auto-redirect window widens to catch the slow pipeline,
// the failure window widens to surface the slow pipeline's eventual
// failure. The `args` filter on indexed event topics keeps the RPC
// bandwidth bounded.
const SCAN_WINDOW_BLOCKS = 50_000n;

const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http(RPC_URL),
});

export type GenerationFailure = {
  requestId: bigint;
  status: number; // ResponseStatus enum (uint8)
  reason: string;
  // v29 (L1): original topic the human submitted, recovered from the
  // GenerationRequested event's data. Null if the topic can't be recovered
  // (event outside the scan window, decode failure, or the request was
  // submitted by a different relayer instance before the L1 was shipped).
  topic: string | null;
  blockNumber: bigint;
  txHash: `0x${string}`;
};

async function fetchRecentGenerationFailures(): Promise<GenerationFailure[]> {
  let head: bigint;
  try {
    head = await publicClient.getBlockNumber();
  } catch {
    // v49 (L2): silent return is intentional — same retry-on-next-poll
    // pattern as useMarketCreatedByRequestId. An empty list surfaces as
    // "no recent failures" in the AgentCommandCenter recovery card
    // (v24 M3 wired the empty-state copy), which is the correct UX
    // for a transient RPC blip.
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
    // v49 (L2): silent return is intentional — same retry-on-next-poll
    // pattern. A getLogs failure on a 5000-block range is usually a
    // rate-limit response (the relayer's getLogs chunking at v11 L1
    // is the production-side mitigation; the frontend reads a smaller
    // window but the same RPC rate limit applies).
    return [];
  }

  const failed = rawLogs.filter(
    (l) => l.topics[0]?.toLowerCase() === GENERATION_FAILED_TOPIC.toLowerCase(),
  );

  // v29 (L1): build a requestId → topic map from the same scan range. Both
  // events (GenerationRequested and GenerationFailed) for a given request
  // land within a few blocks of each other — the platform callback is
  // seconds-to-minutes, well inside the 50_000-block window. If a topic is
  // missing from the map, the request is either outside the window or
  // the GenerationRequested decode failed; either way, surface null and
  // let the UI show "unknown topic".
  const requested = rawLogs.filter(
    (l) => l.topics[0]?.toLowerCase() === GENERATION_REQUESTED_TOPIC.toLowerCase(),
  );
  const topicByRequestId = new Map<bigint, string>();
  for (const log of requested) {
    const requestId = BigInt(log.topics[1] ?? 0n);
    try {
      const decoded = decodeAbiParameters([{ type: 'string' }], log.data);
      const topic = decoded[0];
      if (typeof topic === 'string' && topic.length > 0) {
        topicByRequestId.set(requestId, topic);
      }
    } catch {
      // Malformed log — skip silently. The failure row will show null.
    }
  }

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
      topic: topicByRequestId.get(requestId) ?? null,
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
