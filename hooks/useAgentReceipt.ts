'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { type AgentReceipt, receiptIsComplete } from '@/lib-web/agents';

// 5 minutes is the longest the receipt pipeline should ever take on a healthy
// platform. After that we stop polling and surface a "this is taking longer
// than expected" UI so the user knows it's not a broken spinner.
const MAX_POLL_MS = 5 * 60 * 1000;

export function useAgentReceipt(requestId?: string | bigint) {
  const id = requestId?.toString();
  const [startedAt] = useState(() => Date.now());

  const query = useQuery<AgentReceipt>({
    queryKey: ['agent-receipt', id],
    enabled: !!id && id !== '0',
    queryFn: async () => {
      const response = await fetch(`/api/receipt/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch receipt');
      }
      return response.json();
    },
    refetchInterval: (query) => {
      if (receiptIsComplete(query.state.data)) return false;
      if (query.state.status === 'error') return false;
      if (Date.now() - startedAt > MAX_POLL_MS) return false;
      return 5000;
    },
    retry: 2,
  });

  // Expose a flag so the UI can show a "long-running" hint without re-checking the clock.
  const [isLongRunning, setIsLongRunning] = useState(false);
  useEffect(() => {
    if (receiptIsComplete(query.data)) {
      setIsLongRunning(false);
      return;
    }
    // On error after the retry budget is exhausted, surface the long-running
    // UI early so the user can hit Refresh instead of staring at a spinner.
    if (query.error) {
      setIsLongRunning(true);
      return;
    }
    if (Date.now() - startedAt > MAX_POLL_MS) {
      setIsLongRunning(true);
      return;
    }
    // Healthy polling — clear the long-running flag in case it was set by a
    // transient error, then schedule a setTimeout for the *remaining* time
    // until the deadline. (Re-arming with the full MAX_POLL_MS on every
    // query.data update would push the timeout out indefinitely under
    // continuous polling.)
    setIsLongRunning(false);
    const remaining = MAX_POLL_MS - (Date.now() - startedAt);
    const handle = setTimeout(() => {
      if (!receiptIsComplete(query.data)) setIsLongRunning(true);
    }, remaining);
    return () => clearTimeout(handle);
  }, [query.data, query.error, startedAt]);

  return { ...query, isLongRunning };
}
