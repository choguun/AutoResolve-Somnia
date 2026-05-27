'use client';

import { useQuery } from '@tanstack/react-query';
import { type AgentReceipt, receiptIsComplete } from '@/lib-web/agents';

export function useAgentReceipt(requestId?: string | bigint) {
  const id = requestId?.toString();

  return useQuery<AgentReceipt>({
    queryKey: ['agent-receipt', id],
    enabled: !!id && id !== '0',
    queryFn: async () => {
      const response = await fetch(`/api/receipt/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch receipt');
      }
      return response.json();
    },
    refetchInterval: (query) => (receiptIsComplete(query.state.data) ? false : 5000),
    retry: 2,
  });
}
