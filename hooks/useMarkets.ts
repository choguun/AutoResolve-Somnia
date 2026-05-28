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

      for (let id = startId; id >= endId; id--) {
        const market = (await publicClient!.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getMarket',
          args: [BigInt(id)],
        })) as Market;

        if (market.question) {
          markets.push({ id: BigInt(id), market });
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
    queryKey: ['myBetsMarkets', address, markets?.map(({ id }) => id.toString()).join(',')],
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
