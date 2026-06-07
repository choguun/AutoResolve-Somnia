'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import { createPublicClient, http, type PublicClient } from 'viem';
import {
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  type Market,
  type Bet,
} from '@/lib-web/contract';
import { somniaTestnet } from '@/lib-web/somnia';

const fallbackPublicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http('https://dream-rpc.somnia.network'),
});

function useSomniaPublicClient(): PublicClient {
  return (usePublicClient() ?? fallbackPublicClient) as PublicClient;
}

export type UserMarketPosition = {
  id: bigint;
  market: Market;
  yes: bigint;
  no: bigint;
};

export function useNextMarketId() {
  const publicClient = useSomniaPublicClient();

  return useQuery({
    queryKey: ['nextMarketId'],
    queryFn: async () => {
      return publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'nextMarketId',
      }) as Promise<bigint>;
    },
    refetchInterval: 10_000,
  });
}

export function useMarket(marketId: bigint | undefined) {
  const publicClient = useSomniaPublicClient();

  return useQuery({
    queryKey: ['market', marketId?.toString()],
    enabled: marketId !== undefined && marketId > 0n,
    queryFn: async () => {
      const market = (await publicClient!.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getMarket',
        args: [marketId!],
      })) as Market;
      return market;
    },
    refetchInterval: 5_000,
  });
}

export function useMarkets() {
  const { data: nextMarketId } = useNextMarketId();
  const publicClient = useSomniaPublicClient();
  const PAGE_SIZE = 9; // Grid is 3 columns, so 9 is a perfect multiple

  return useInfiniteQuery({
    queryKey: ['markets', nextMarketId?.toString()],
    enabled: !!nextMarketId && nextMarketId > 1n,
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const markets: Array<{ id: bigint; market: Market }> = [];
      const total = Number(nextMarketId!);
      
      const startId = total - 1 - pageParam * PAGE_SIZE;
      const endId = Math.max(1, startId - PAGE_SIZE + 1);

      if (startId < 1) return [];

      // v37 (M0): was a sequential `for` loop awaiting 9 getMarket reads one
      // after the other — at Shannon RPC's 200-500ms/read latency, a full
      // page took 1.8-4.5s to land. Switched to Promise.all so the page
      // collapses to a single round-trip latency window (~500ms, the slowest
      // of the 9 reads). Order is preserved because Promise.all resolves
      // inputs in order; the marketIds array is also built in order so the
      // `markets.push` below walks the highest-id-first page identically
      // to the pre-v37 sequential path. Same pattern as useMyBets
      // (L165) and useUserBets (L228).
      const ids: bigint[] = [];
      for (let id = startId; id >= endId; id--) {
        ids.push(BigInt(id));
      }
      const reads = await Promise.all(
        ids.map((id) =>
          publicClient!.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getMarket',
            args: [id],
          }) as Promise<Market>,
        ),
      );
      for (let i = 0; i < reads.length; i++) {
        const market = reads[i];
        if (market.question) {
          markets.push({ id: ids[i], market });
        }
      }

      return markets;
    },
    getNextPageParam: (lastPage, allPages) => {
      const fetchedCount = allPages.reduce((sum, page) => sum + page.length, 0);
      const total = Number(nextMarketId!) - 1;
      if (fetchedCount >= total) return undefined;
      return allPages.length;
    },
    refetchInterval: 10_000,
  });
}

export function useMarketBets(marketId: bigint | undefined) {
  const publicClient = useSomniaPublicClient();

  return useQuery({
    queryKey: ['marketBets', marketId?.toString()],
    enabled: marketId !== undefined && marketId > 0n,
    queryFn: async () => {
      return publicClient!.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getMarketBets',
        args: [marketId!],
      }) as Promise<Bet[]>;
    },
    refetchInterval: 10_000,
  });
}

export function useResolutionDeposit() {
  const publicClient = useSomniaPublicClient();

  return useQuery({
    queryKey: ['resolutionDeposit'],
    queryFn: async () => {
      return publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getResolutionDeposit',
      }) as Promise<bigint>;
    },
    refetchInterval: 30_000,
  });
}

export function useMyBets() {
  const { address } = useAccount();
  const publicClient = useSomniaPublicClient();

  return useQuery<UserMarketPosition[]>({
    // v40 (L0): the contract now exposes `getUserMarkets(address)` which
    // returns the list of market ids the user has bet on, in O(K) time
    // where K = the user's position count. Pre-v40, this hook had to
    // (1) load every market page via useMarkets (the v23 M2 tab-switch
    // trigger in app/page.tsx fanned out O(N) RPCs to find the user's
    // positions), and (2) read userYesBets + userNoBets for each loaded
    // market. The new key is just (address) — no dependency on the
    // markets array, no tab-switch trigger, no O(N) scan. The polling
    // interval is 10s, same as the pre-v40 useMyBets, so the user sees
    // new positions and resolved outcomes without manual tab switching.
    queryKey: ['myBets', address],
    enabled: !!address,
    queryFn: async (): Promise<UserMarketPosition[]> => {
      // Step 1: one read to get the user's market IDs.
      const marketIds = (await publicClient!.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getUserMarkets',
        args: [address!],
      })) as bigint[];

      if (marketIds.length === 0) return [];

      // Step 2: read market + position amounts in parallel for each id.
      // Each entry is a Promise.all of (getMarket, userYesBets, userNoBets)
      // — same per-market read shape as the pre-v40 useMyBetsMarkets loop,
      // but with all markets in parallel. Promise.all preserves input
      // order, so the output array mirrors userMarketIds[address] (which
      // is the order the user first bet on each market).
      const reads = await Promise.all(
        marketIds.map(async (id): Promise<UserMarketPosition | null> => {
          const [market, yes, no] = await Promise.all([
            publicClient!.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: 'getMarket',
              args: [id],
            }) as Promise<Market>,
            publicClient!.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: 'userYesBets',
              args: [address!, id],
            }) as Promise<bigint>,
            publicClient!.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: 'userNoBets',
              args: [address!, id],
            }) as Promise<bigint>,
          ]);
          // The contract's userMarketIds tracks "user has bet on this
          // market at some point" — after a claim, the amounts are
          // zeroed but the market id stays. Filter out claimed/zeroed
          // positions so the My Bets list shows "active position" only
          // (the same semantics as the pre-v40 useMyBetsMarkets filter).
          if (yes === 0n && no === 0n) return null;
          return { id, market: market as Market, yes, no };
        }),
      );

      return reads.filter((p): p is UserMarketPosition => p !== null);
    },
    refetchInterval: 10_000,
  });
}

export function useUserBets(marketId: bigint | undefined, address?: `0x${string}`) {
  const publicClient = useSomniaPublicClient();

  return useQuery({
    queryKey: ['userBets', marketId?.toString(), address],
    enabled: !!address && marketId !== undefined && marketId > 0n,
    queryFn: async () => {
      const [yes, no] = await Promise.all([
        publicClient!.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'userYesBets',
          args: [address!, marketId!],
        }) as Promise<bigint>,
        publicClient!.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'userNoBets',
          args: [address!, marketId!],
        }) as Promise<bigint>,
      ]);
      return { yes, no };
    },
    refetchInterval: 10_000,
  });
}
