'use client';

import { useEffect, useRef, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { somniaTestnet } from '@/lib-web/somnia';

const RPC_URL = 'https://dream-rpc.somnia.network';
const SLOW_THRESHOLD_MS = 1500;
const POLL_INTERVAL_MS = 30_000;

// v34 (L1): after 2 consecutive same-block ticks (~60s at POLL_INTERVAL_MS=30s),
// escalate 'slow' to 'stuck'. Operators care about "chain halted" vs "chain
// slow but alive" because the recovery path is different (wait it out vs
// restart the node). Pre-v34, the same-block counter existed implicitly
// inside `lastBlockRef.current === block` but never graduated to a distinct
// status — a chain halted for 10 minutes still read as 'slow'.
const STUCK_TICK_THRESHOLD = 2;

export type RpcHealth = 'ok' | 'slow' | 'down' | 'pending' | 'stuck';

const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) });

export function useRpcHealth() {
  const [health, setHealth] = useState<RpcHealth>('pending');
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const lastBlockRef = useRef<bigint | null>(null);
  // v34 (L1): consecutive same-block tick counter. Reset to 0 on any
  // advancing tick. Read in the same body that decides 'slow' vs 'stuck'.
  const sameBlockStreakRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const start = performance.now();
      try {
        const block = await client.getBlockNumber();
        const elapsed = performance.now() - start;
        if (cancelled) return;
        setBlockNumber(block);
        setLatencyMs(elapsed);
        // v34 (H1): the first tick must NOT report 'ok'. Pre-v34, the
        // `lastBlockRef.current === null` short-circuit made the advancing
        // check trivially true — a user loading /proof right when the
        // chain had halted saw the green 'ok' dot for ~30s. Now the
        // first tick returns 'pending' (we got a block but don't yet
        // know if the chain is advancing). The second tick can confirm
        // 'ok' / 'slow' / 'stuck' from a real comparison.
        if (lastBlockRef.current === null) {
          sameBlockStreakRef.current = 0;
          lastBlockRef.current = block;
          setHealth('pending');
          return;
        }
        if (block > lastBlockRef.current) {
          sameBlockStreakRef.current = 0;
          lastBlockRef.current = block;
          setHealth(elapsed <= SLOW_THRESHOLD_MS ? 'ok' : 'slow');
          return;
        }
        // block <= lastBlockRef.current — chain didn't advance this tick.
        sameBlockStreakRef.current += 1;
        lastBlockRef.current = block;
        // v34 (L1): escalate 'slow' → 'stuck' after 2 consecutive
        // same-block ticks. Stuck overrides the latency threshold
        // because a halted chain reads as "fast" (the RPC returns the
        // same block instantly) and the latency branch alone is
        // misleading. The streak counter resets on any advancing tick.
        setHealth(
          sameBlockStreakRef.current >= STUCK_TICK_THRESHOLD
            ? 'stuck'
            : 'slow'
        );
      } catch {
        if (cancelled) return;
        setHealth('down');
      }
    }

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { health, blockNumber, latencyMs };
}
