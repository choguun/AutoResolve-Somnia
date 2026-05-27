export const AGENTS_RECEIPT_API = 'https://receipts.testnet.agents.somnia.host';
export const AGENTS_EXPLORER = 'https://agents.testnet.somnia.network';
export const SHANNON_EXPLORER = 'https://shannon-explorer.somnia.network';

export const LLM_PARSE_WEBSITE_AGENT_ID = '12875401142070969085';
export const LLM_INFERENCE_AGENT_ID = '12847293847561029384';

export function receiptUrl(requestId: string | bigint): string {
  return `${AGENTS_RECEIPT_API}?requestId=${requestId.toString()}`;
}

export function receiptExplorerUrl(requestId: string | bigint): string {
  return `${AGENTS_EXPLORER}/receipts/${requestId.toString()}`;
}

export function txExplorerUrl(txHash: string): string {
  return `${SHANNON_EXPLORER}/tx/${txHash}`;
}

export function addressExplorerUrl(address: string): string {
  return `${SHANNON_EXPLORER}/address/${address}`;
}

export type ReceiptStep = {
  name?: string;
  timestamp?: string;
  function?: string;
  args?: unknown;
  url?: string;
  method?: string;
  duration_ms?: number;
  status?: number;
  body_preview?: string;
  message?: string;
  content?: string;
  output?: string;
  [key: string]: unknown;
};

export type AgentReceipt = {
  requestId?: string;
  agentId?: string;
  agentName?: string;
  status?: 'pending' | 'success' | 'failure' | string;
  steps?: ReceiptStep[];
  result?: string;
  subcommittee?: {
    size?: number;
    consensusType?: string;
    nodes?: Array<{
      address?: string;
      output?: string;
      executionTimeMs?: number;
    }>;
  };
  payload?: Record<string, unknown>;
  confidenceScore?: number;
  blockNumber?: number;
  timestamp?: number;
  txHash?: string;
  [key: string]: unknown;
};

export function receiptHasError(steps?: ReceiptStep[]): boolean {
  return !!steps?.some((step) => step.name === 'error');
}

export function receiptIsComplete(receipt?: AgentReceipt): boolean {
  if (!receipt) return false;
  if (receipt.status === 'success' || receipt.status === 'failure') return true;
  if (receipt.result) return true;
  if (receipt.steps?.some((s) => s.name === 'response_encoded')) return true;
  return receiptHasError(receipt.steps);
}
