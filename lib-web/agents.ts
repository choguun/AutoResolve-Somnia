import { decodeAbiParameters } from 'viem';

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
  // v24 (H1): when the receipt is for a generation request, this carries
  // the decoded createMarket calldata from the agent's pendingToolCalls.
  // Resolution receipts leave this undefined.
  generationToolCall?: GenerationToolCall;
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

// v24 (H1): for a generation receipt the deliverable is the
// `createMarket(question, source, durationSeconds)` calldata inside
// `pendingToolCalls` — the abi.encode of the `inferToolsChat` response tuple
// (string, string, string[], string[], string[], bytes[]). The receipt
// viewer's "Result" panel was showing the agent's narration (a `llm_response`
// string) or the raw hex blob of the response_encoded output, neither of
// which surfaces the question/source/duration the agent actually designed.
// This helper decodes the response_encoded output and returns the first
// createMarket call's args so the viewer can render a structured
// "Agent Designed Market" panel. Returns null when the receipt isn't a
// generation-style response or no createMarket call is present.
export type GenerationToolCall = {
  question: string;
  source: string;
  durationSeconds: bigint;
  rawCalldata: `0x${string}`;
};

const CREATE_MARKET_SELECTOR = '0xfb6a61aa'; // keccak256("createMarket(string,string,uint256)").slice(0, 8)

export function extractGenerationToolCall(entry?: RawReceiptEntry): GenerationToolCall | null {
  const steps = entry?.agentReceipt?.steps || [];
  const encodedStep = steps.find((s) => s.name === 'response_encoded');
  if (!encodedStep || typeof encodedStep.output !== 'string') return null;

  const raw = encodedStep.output;
  // viem's decodeAbiParameters accepts a hex string with or without 0x prefix
  // and is safe to call on a `bytes[]` element (an opaque hex blob). The
  // response_encoded output is the full abi.encode of the inferToolsChat
  // response tuple, always returned by the platform as a 0x-prefixed hex
  // string. The cast is required because the receipt type is `string`.
  const hex = (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`;
  let decoded: readonly unknown[];
  try {
    decoded = decodeAbiParameters(
      [
        { type: 'string' }, // finishReason
        { type: 'string' }, // response (model narration)
        { type: 'string[]' }, // updatedRoles
        { type: 'string[]' }, // updatedMessages
        { type: 'string[]' }, // pendingToolCallIds
        { type: 'bytes[]' }, // pendingToolCalls
      ],
      hex,
    );
  } catch {
    return null;
  }
  const pendingToolCalls = decoded[5] as readonly `0x${string}`[] | undefined;
  if (!pendingToolCalls || pendingToolCalls.length === 0) return null;

  // Find the first createMarket call. Most prompts return one; the contract
  // executes the first matching call and emits a DuplicateToolCall advisory
  // for any extras. We surface the first so the viewer shows the market that
  // was actually created.
  for (const call of pendingToolCalls) {
    if (typeof call !== 'string') continue;
    if (!call.startsWith('0x')) continue;
    if (call.slice(0, 10).toLowerCase() !== CREATE_MARKET_SELECTOR) continue;
    try {
      const args = decodeAbiParameters(
        [
          { type: 'string' },
          { type: 'string' },
          { type: 'uint256' },
        ],
        `0x${call.slice(10)}`,
      ) as readonly [string, string, bigint];
      return {
        question: args[0],
        source: args[1],
        durationSeconds: args[2],
        rawCalldata: call as `0x${string}`,
      };
    } catch {
      // Malformed createMarket calldata; try the next tool call.
      continue;
    }
  }
  return null;
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
    // v24 (H1): surface the createMarket call so the viewer can render
    // an "Agent Designed Market" panel for generation receipts. The
    // decoder reads the response_encoded step and pulls the first
    // createMarket calldata out of pendingToolCalls.
    generationToolCall: extractGenerationToolCall(primary) ?? undefined,
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
