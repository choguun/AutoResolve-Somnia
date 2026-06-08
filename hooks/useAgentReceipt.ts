'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type AgentReceipt, receiptIsComplete } from '@/lib-web/agents';

// v35 (H1): renamed MAX_POLL_MS → LONG_RUNNING_HINT_MS. 5 minutes is the
// longest the receipt pipeline should ever take on a healthy platform. v27
// dropped the polling cap that used to live in `refetchInterval` below —
// the constant is now purely a UI threshold for the "this is taking
// longer than expected" hint surfaced in AgentReceiptViewer. Polling
// continues until the receipt completes or the query errors, so a
// healthy-but-slow pipeline (a slow LLM, a queued validator, a brief
// platform hiccup) can still surface its result instead of getting stuck
// behind a 5-min wall. The old name was misleading — it sounded like a
// polling budget, which it isn't anymore.
const LONG_RUNNING_HINT_MS = 5 * 60 * 1000;

// v14: callers identify which pipeline produced the receipt so the UI can
// pick the right copy when a receipt is slow or missing. Generation receipts
// are observability-only (the deposit was forwarded and isn't refundable —
// see [[auto-resolve-v13-stuck-gen-and-cap]]), while resolution receipts gate
// real on-chain payouts, so the messaging differs.
export type ReceiptKind = 'resolution' | 'generation';

export function useAgentReceipt(requestId?: string | bigint, kind: ReceiptKind = 'resolution') {
  const id = requestId?.toString();
  // v35 (H2): was `useState(() => Date.now())`, which captured the wall
  // clock at hook mount time. On a route that mounts the hook ONCE and
  // then changes the requestId (e.g. /receipt/[requestId] when the user
  // clicks through the creation pipeline), the long-running hint was
  // anchored to the FIRST requestId, not the current one — a user looking
  // at receipt #2 would see the banner timing based on receipt #1's
  // fetch start. Move to useRef + useEffect keyed on `id` so the hint is
  // always anchored to the current requestId's first fetch.
  const startedAtRef = useRef(Date.now());
  useEffect(() => {
    startedAtRef.current = Date.now();
  }, [id]);
  const startedAt = startedAtRef.current;

  const query = useQuery<AgentReceipt>({
    queryKey: ['agent-receipt', id],
    enabled: !!id && id !== '0',
    queryFn: async () => {
      const response = await fetch(`/api/receipt/${id}`);
      if (!response.ok) {
        // v14: pass the upstream status through so the UI can show
        // "platform is throttling" vs "platform is down" vs "stale link".
        let upstreamStatus: number | undefined;
        try {
          const body = (await response.json()) as { upstreamStatus?: number };
          upstreamStatus = typeof body?.upstreamStatus === 'number' ? body.upstreamStatus : undefined;
        } catch {
          // v49 (L2): silent return is intentional — upstreamStatus
          // defaults to undefined if the 502/404 body is malformed
          // (the route handler already returned a Cache-Control header
          // so a downstream CDN can't latch onto a 502, and the hook's
          // outer err.status branch at L67 still routes correctly).
          // A console.warn here would spam the dev console on every
          // 404 polling tick.
          upstreamStatus = undefined;
        }
        const err = new Error(
          response.status === 404
            ? 'Receipt not found yet'
            : 'Receipt upstream unavailable'
        ) as Error & { status?: number; upstreamStatus?: number };
        err.status = response.status;
        err.upstreamStatus = upstreamStatus;
        throw err;
      }
      return response.json();
    },
    refetchInterval: (query) => {
      if (receiptIsComplete(query.state.data)) return false;
      if (query.state.status === 'error') {
        // v33 (L1): branch on the upstream status. 404 means "not yet indexed"
        // (the platform hasn't seen this requestId yet — normal for the first
        // few seconds after the tx mines) and should keep polling; only 5xx
        // and unknown errors stop the polling loop. Pre-v33, the single
        // `status === 'error' → false` rule meant a slow-to-index receipt
        // would stop polling entirely after `retry: 2` (~10-15s of 404s), and
        // the user had to click Refresh to recover.
        // v36 (L1): cap the 404 polling at LONG_RUNNING_HINT_MS. A
        // permanently-lost receipt (stale link, dead requestId) was
        // burning a 5s poll + a server round-trip forever. Once the 404
        // streak crosses LONG_RUNNING_HINT_MS, return `false` to stop
        // polling. The `hasGivenUpOn404` flag surfaced below + the
        // AgentReceiptViewer Refresh button let the user retry from a
        // clean slate.
        const err = query.state.error as (Error & { status?: number }) | null;
        if (err?.status !== 404) return false;
        const firstNotFoundAt = firstNotFoundAtRef.current;
        if (firstNotFoundAt != null && Date.now() - firstNotFoundAt > LONG_RUNNING_HINT_MS) {
          return false;
        }
        return 5000;
      }
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
    // v33 (L2): 404 ("not yet indexed") is NOT a real error and shouldn't
    // trigger the amber "taking longer than expected" banner — the polling
    // is healthy, the platform just hasn't indexed yet. 5xx (and unknown)
    // keep the original behavior.
    if (query.error) {
      const err = query.error as Error & { status?: number };
      if (err.status === 404) {
        setIsLongRunning(false);
      } else {
        setIsLongRunning(true);
      }
      return;
    }
    if (Date.now() - startedAt > LONG_RUNNING_HINT_MS) {
      setIsLongRunning(true);
      return;
    }
    // Healthy polling — clear the long-running flag in case it was set by a
    // transient error, then schedule a setTimeout for the *remaining* time
    // until the deadline. (Re-arming with the full LONG_RUNNING_HINT_MS on
    // every query.data update would push the timeout out indefinitely
    // under continuous polling.)
    setIsLongRunning(false);
    const remaining = LONG_RUNNING_HINT_MS - (Date.now() - startedAt);
    const handle = setTimeout(() => {
      if (!receiptIsComplete(query.data)) setIsLongRunning(true);
    }, remaining);
    return () => clearTimeout(handle);
  }, [query.data, query.error, startedAt]);

  // v36 (L1): cap the 404 polling at LONG_RUNNING_HINT_MS. v33 L1 switched
  // the 404 path from "stop polling entirely" to "keep polling at 5s", which
  // was the right fix for a slow-to-index receipt — but a receipt that
  // stays in 404 for hours (e.g. the user bookmarked a stale requestId, or
  // the platform permanently lost the request) burns a 5s poll + a server
  // round-trip forever. Track the first 404 timestamp and stop polling
  // after LONG_RUNNING_HINT_MS of consecutive 404s. The flag is exposed
  // to the UI so AgentReceiptViewer can swap the "request not yet indexed"
  // message for a "we've stopped polling" message and surface a Refresh
  // button. The ref is reset on success, on id change, and on a manual
  // refetch (the user wants to try again from a clean slate).
  const firstNotFoundAtRef = useRef<number | null>(null);
  useEffect(() => {
    firstNotFoundAtRef.current = null;
  }, [id]);
  useEffect(() => {
    if (receiptIsComplete(query.data)) {
      firstNotFoundAtRef.current = null;
    }
  }, [query.data]);

  const refetch = useMemo(() => {
    const inner = query.refetch;
    return async (...args: Parameters<typeof inner>) => {
      firstNotFoundAtRef.current = null;
      return inner(...args);
    };
  }, [query.refetch]);

  const hasGivenUpOn404 =
    query.error != null &&
    (query.error as Error & { status?: number }).status === 404 &&
    firstNotFoundAtRef.current != null &&
    Date.now() - firstNotFoundAtRef.current > LONG_RUNNING_HINT_MS;

  // Hook the 404 streak tracking into the refetchInterval body via a
  // refetch-side effect: when a 404 lands, set firstNotFoundAtRef; when
  // anything else lands, clear it. We can't do this inside refetchInterval
  // (it must be pure / cheap), so a separate effect owns the bookkeeping.
  useEffect(() => {
    const err = query.error as (Error & { status?: number }) | null;
    if (err?.status === 404) {
      if (firstNotFoundAtRef.current == null) {
        firstNotFoundAtRef.current = Date.now();
      }
    } else {
      firstNotFoundAtRef.current = null;
    }
  }, [query.error]);

  return { ...query, isLongRunning, hasGivenUpOn404, refetch, kind };
}
