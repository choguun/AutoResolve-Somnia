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
      // to the pre-v37 sequential path. Same pattern as useMyBetsMarkets
      // (L162) and useUserBets (L212).
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

export function useMyBetsMarkets(
  markets: Array<{ id: bigint; market: Market }> | undefined,
  address?: `0x${string}`
) {
  const publicClient = useSomniaPublicClient();

  return useQuery({
    // v25 (M1): the joined `id,id,id,...` key made any new market creation
    // invalidate the cache and force a full O(N) re-read of every position.
    // With useMarkets polling every 10s and the My Bets tab active, this
    // was an O(2N) read (userYesBets + userNoBets) per market creation event.
    // Use the market count as a stable structural fingerprint instead —
    // TanStack Query will still re-run when the markets array changes shape
    // (new pages via fetchNextPage), but a fresh market id within the same
    // page count won't bust the cache. The markets array itself is captured
    // in the query closure, so the queryFn reads positions for whatever
    // markets are currently loaded.
    queryKey: ['myBetsMarkets', address, markets?.length ?? 0],
    enabled: !!address && !!markets?.length,
    queryFn: async () => {
      const positions = await Promise.all(
        markets!.map(async ({ id, market }) => {
          const [yes, no] = await Promise.all([
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

          if (yes === 0n && no === 0n) return null;
          return { id, market, yes, no } satisfies UserMarketPosition;
        })
      );

      return positions.filter((p): p is UserMarketPosition => p !== null);
    },
    refetchInterval: 10_000,
  });
}

export function useMyBets() {
  const { address } = useAccount();
  const { data: marketsData, isLoading: marketsLoading, error: marketsError } = useMarkets();
  
  const allMarkets = marketsData?.pages.flat();
  const query = useMyBetsMarkets(allMarkets, address);

  return {
    ...query,
    isLoading: marketsLoading || query.isLoading,
    error: marketsError || query.error,
    isConnected: !!address,
  };
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
