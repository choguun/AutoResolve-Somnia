'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import {
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  type Market,
  type Bet,
} from '@/lib-web/contract';

export function useNextMarketId() {
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ['nextMarketId'],
    queryFn: async () => {
      if (!publicClient) return 1n;
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
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ['market', marketId?.toString()],
    enabled: !!publicClient && marketId !== undefined && marketId > 0n,
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
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ['markets', nextMarketId?.toString()],
    enabled: !!publicClient && !!nextMarketId && nextMarketId > 1n,
    queryFn: async () => {
      const markets: Array<{ id: bigint; market: Market }> = [];
      const total = Number(nextMarketId!);

      for (let id = 1; id < total; id++) {
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

      return markets.reverse();
    },
    refetchInterval: 10_000,
  });
}

export function useMarketBets(marketId: bigint | undefined) {
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ['marketBets', marketId?.toString()],
    enabled: !!publicClient && marketId !== undefined && marketId > 0n,
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
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ['resolutionDeposit'],
    queryFn: async () => {
      if (!publicClient) return 0n;
      return publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getResolutionDeposit',
      }) as Promise<bigint>;
    },
    refetchInterval: 30_000,
  });
}

export function useUserBets(marketId: bigint | undefined, address?: `0x${string}`) {
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ['userBets', marketId?.toString(), address],
    enabled: !!publicClient && !!address && marketId !== undefined && marketId > 0n,
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
