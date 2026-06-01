'use client';

import { useEffect, useRef, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { somniaTestnet } from '@/lib-web/somnia';

const RPC_URL = 'https://dream-rpc.somnia.network';
const SLOW_THRESHOLD_MS = 1500;
const POLL_INTERVAL_MS = 30_000;

export type RpcHealth = 'ok' | 'slow' | 'down' | 'pending';

const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) });

export function useRpcHealth() {
  const [health, setHealth] = useState<RpcHealth>('pending');
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const lastBlockRef = useRef<bigint | null>(null);

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
        const advancing = lastBlockRef.current === null || block > lastBlockRef.current;
        lastBlockRef.current = block;
        setHealth(advancing && elapsed <= SLOW_THRESHOLD_MS ? 'ok' : 'slow');
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
