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

export function formatStt(value: bigint): string {
  const num = Number(value) / 1e18;
  if (num === 0) return '0 STT';
  if (num < 0.001) return `${num.toExponential(2)} STT`;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 4 })} STT`;
}

export function formatCountdown(endTime: bigint): string {
  const diff = Number(endTime) * 1000 - Date.now();
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
