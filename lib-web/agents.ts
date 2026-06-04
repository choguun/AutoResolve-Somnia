export const AGENTS_RECEIPT_API = 'https://receipts.testnet.agents.somnia.host';
export const AGENTS_EXPLORER = 'https://agents.testnet.somnia.network';
export const SHANNON_EXPLORER = 'https://shannon-explorer.somnia.network';
export const SOMNIA_PLATFORM_ADDRESS =
  '0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776' as const;

export const LLM_PARSE_WEBSITE_AGENT_ID = '12875401142070969085';
export const LLM_INFERENCE_AGENT_ID = '12847293847561029384';

export function receiptExplorerUrl(requestId: string | bigint): string {
  return `${AGENTS_EXPLORER}/receipts/${requestId.toString()}`;
}

// v17 (H2): the `contractAddress` query param should be the AutoResolve
// contract that initiated the request, not the Somnia platform address.
// The platform filters receipts by the originating contract; passing
// `SOMNIA_PLATFORM_ADDRESS` returns the platform's own receipts (which
// isn't what the receipt page wants). Default to SOMNIA_PLATFORM_ADDRESS
// for back-compat with the deprecated client-side `receiptUrl()`, but
// server-side route handlers should pass the AutoResolve contract
// address (read from `process.env.NEXT_PUBLIC_CONTRACT_ADDRESS`).
export function receiptServiceUrl(
  requestId: string | bigint,
  type: 'minimal' | 'full' = 'minimal',
  contractAddress: string = SOMNIA_PLATFORM_ADDRESS
): string {
  const url = new URL(`${AGENTS_RECEIPT_API}/agent-receipts`);
  url.searchParams.set('requestId', requestId.toString());
  url.searchParams.set('contractAddress', contractAddress);
  url.searchParams.set('type', type);
  return url.toString();
}

/** @deprecated Use /api/receipt/[requestId] from the client */
export function receiptUrl(requestId: string | bigint): string {
  return receiptServiceUrl(requestId);
}

export function txExplorerUrl(txHash: string): string {
  return `${SHANNON_EXPLORER}/tx/${txHash}`;
}

export function addressExplorerUrl(address: string): string {
  return `${SHANNON_EXPLORER}/address/${address}`;
}

export function agentNameForId(agentId?: string): string {
  if (agentId === LLM_PARSE_WEBSITE_AGENT_ID) return 'LLM Parse Website';
  if (agentId === LLM_INFERENCE_AGENT_ID) return 'LLM Inference';
  return agentId ? `Agent ${agentId}` : 'Unknown';
}

export type ReceiptStep = {
  name?: string;
  timestamp?: string;
  function?: string;
  functionName?: string;
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
  elapsedMs?: number;
  [key: string]: unknown;
};

type RawReceiptEntry = {
  requestId?: string;
  agentId?: string;
  agentRunnerAddress?: string;
  status?: string;
  elapsedMs?: number;
  agentReceipt?: {
    result?: string;
    steps?: ReceiptStep[];
  };
};

export type RawMinimalReceiptResponse = {
  requestId: string;
  contractAddress?: string;
  consensusType?: number;
  receipts: RawReceiptEntry[];
};

function stepOutput(step: ReceiptStep): string | undefined {
  if (typeof step.content === 'string') return step.content;
  if (typeof step.output === 'string') return step.output;
  if (typeof step.body_preview === 'string') return step.body_preview;
  if (step.url) return step.url;
  if (step.functionName) return step.functionName;
  return undefined;
}

function normalizeSteps(steps?: ReceiptStep[]): ReceiptStep[] {
  if (!steps?.length) return [];

  return steps.map((step) => ({
    ...step,
    function: step.function || step.functionName,
    output: stepOutput(step),
  }));
}

function extractResult(entry?: RawReceiptEntry): string | undefined {
  const steps = entry?.agentReceipt?.steps || [];
  const llmStep = steps.find((s) => s.name === 'llm_response');
  if (llmStep && typeof llmStep.content === 'string') return llmStep.content;

  const encodedStep = steps.find((s) => s.name === 'response_encoded');
  if (encodedStep && typeof encodedStep.output === 'string') return encodedStep.output;

  return undefined;
}

export function normalizeMinimalReceipt(data: RawMinimalReceiptResponse): AgentReceipt {
  const primary = data.receipts[0];
  if (!primary) {
    throw new Error('No validator receipts returned');
  }

  const steps = normalizeSteps(primary.agentReceipt?.steps);
  const nodes = data.receipts.map((entry) => ({
    address: entry.agentRunnerAddress,
    executionTimeMs: entry.elapsedMs,
    output: extractResult(entry),
  }));

  const statuses = new Set(data.receipts.map((r) => r.status).filter(Boolean));
  const status =
    statuses.size === 1
      ? (Array.from(statuses)[0] as AgentReceipt['status'])
      : primary.status;

  return {
    requestId: data.requestId,
    agentId: primary.agentId,
    agentName: agentNameForId(primary.agentId),
    status,
    steps,
    result: extractResult(primary),
    elapsedMs: primary.elapsedMs,
    subcommittee: {
      size: data.receipts.length,
      consensusType: data.consensusType === 0 ? 'unanimous' : String(data.consensusType),
      nodes,
    },
  };
}

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
