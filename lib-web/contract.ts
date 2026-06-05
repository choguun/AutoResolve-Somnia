import abi from './abi.json';

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const CONTRACT_ABI = abi;

export const AGENT_CREATOR_SENTINEL = '0x00000000000000000000000000000000000000A1' as `0x${string}`;

export function isAgentCreated(creator: string): boolean {
  return creator?.toLowerCase() === AGENT_CREATOR_SENTINEL;
}

export enum MarketStatus {
  Open = 0,
  Resolving = 1,
  Resolved = 2,
}

export enum BetOption {
  Yes = 0,
  No = 1,
}

export type Market = {
  creator: `0x${string}`;
  question: string;
  resolutionSource: string;
  endTime: bigint;
  yesTotal: bigint;
  noTotal: bigint;
  status: MarketStatus;
  outcome: boolean;
  resolutionReason: string;
  parseRequestId: bigint;
  inferenceRequestId: bigint;
  resolvedAt: bigint;
  parseRequestedAt: bigint;
  inferenceRequestedAt: bigint;
};

export type Bet = {
  better: `0x${string}`;
  amount: bigint;
  option: BetOption;
};

// v22 (H2): precision-safe conversion of a market's on-chain endTime
// (unix seconds as bigint) to milliseconds-since-epoch for Date.now()
// comparisons. The v19 (L2) clamping lived inline in formatCountdown;
// this consolidates the logic so every caller (useResolutionStatus,
// BetPanel) uses the same precision-safe path. block.timestamp fits in
// uint64; we mask to uint32, which covers up to the year 2106 (well past
// the protocol's expected lifetime) and avoids the 2^53 boundary. For
// endTime values beyond uint32 we return 0 — the underlying Solidity
// contract also wouldn't accept those as live markets, so the caller
// treating 0 as "already ended" is the honest answer.
export function endTimeMs(endTime: bigint): number {
  if (endTime > 0xFFFFFFFFn) return 0;
  return Number(endTime & 0xFFFFFFFFn) * 1000;
}

export function formatStt(value: bigint): string {
  // v19 (L2): split integer and fractional parts via bigint division so
  // the lossy Number() conversion only happens on the sub-1STT remainder.
  // IEEE 754 doubles can only represent integers up to 2^53 exactly, so
  // 1.5 STT = 1.5e18 wei would round to a nearby double and show as
  // "1.5000000000000002 STT" or similar. The integer part is what
  // humans actually look at, and the fractional remainder is small
  // enough (<1e18 wei) to convert without loss.
  // v22 (H1): v19 L2 widened the exponential threshold to 1 STT, so
  // every sub-1-STT amount in the UI (the inference deposit 0.3 STT,
  // the resolution deposit 0.66 STT, the demo 0.01 STT bet) showed as
  // "3.00e-1 STT" / "6.60e-1 STT" / "1.00e-2 STT". Restoring the
  // pre-v19 10^15 wei (= 0.001 STT) threshold keeps sub-milliSTT
  // values in exponential form so they don't round to "0 STT", while
  // the [0.001, 1) STT range uses decimal notation like pre-v19.
  const wholeStt = value / 1_000_000_000_000_000_000n;
  const remainderWei = value - wholeStt * 1_000_000_000_000_000_000n;
  if (wholeStt === 0n && remainderWei === 0n) return '0 STT';
  if (wholeStt === 0n) {
    if (remainderWei < 1_000_000_000_000_000n) {
      const expNum = Number(remainderWei) / 1e18;
      return `${expNum.toExponential(2)} STT`;
    }
    const frac = Number(remainderWei) / 1e18;
    const fracStr = frac.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
    return `${fracStr} STT`;
  }
  // Show up to 4 fractional digits from the remainder (which is < 1 STT,
  // so the lossy Number conversion is safe).
  const frac = Number(remainderWei) / 1e18;
  if (frac === 0) {
    return `${wholeStt.toLocaleString()} STT`;
  }
  const fracStr = frac.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
  return `${wholeStt.toLocaleString()}.${fracStr.replace(/^0\./, '')} STT`;
}

export function formatCountdown(endTime: bigint): string {
  // v22 (H2): route through the shared endTimeMs helper so the uint32
  // clamping lives in exactly one place. v19 (L2) added the masking
  // inline here; the two other call sites (useResolutionStatus, BetPanel)
  // were missed and still used the unsafe `Number(endTime) * 1000`
  // pattern. Current 2026 timestamps are safe either way, but the v19
  // invariant was incomplete.
  // v24 (L1): for endTime > 0xFFFFFFFFn, return 'Ended' to match
  // endTimeMs's "already ended" semantic. Previously this returned
  // '>99y', which contradicted the disabled=true signal on BetPanel /
  // canResolve=true signal in useResolutionStatus (both read endTimeMs).
  // MAX_DURATION=86400 makes this unreachable in practice, but the two
  // helpers should agree on the edge case.
  if (endTime > 0xFFFFFFFFn) return 'Ended';
  const diff = endTimeMs(endTime) - Date.now();
  if (diff <= 0) return 'Ended';

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function statusLabel(status: MarketStatus): string {
  switch (status) {
    case MarketStatus.Open:
      return 'Open';
    case MarketStatus.Resolving:
      return 'Resolving';
    case MarketStatus.Resolved:
      return 'Resolved';
    default:
      return 'Unknown';
  }
}

export function oddsPercent(yesTotal: bigint, noTotal: bigint, side: 'yes' | 'no'): number {
  const total = yesTotal + noTotal;
  if (total === 0n) return 50;
  const sideTotal = side === 'yes' ? yesTotal : noTotal;
  return Number((sideTotal * 10000n) / total) / 100;
}
