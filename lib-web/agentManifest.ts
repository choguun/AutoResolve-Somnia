import { CONTRACT_ADDRESS } from './contract';
import {
  AGENTS_EXPLORER,
  LLM_INFERENCE_AGENT_ID,
  LLM_PARSE_WEBSITE_AGENT_ID,
  SHANNON_EXPLORER,
  SOMNIA_PLATFORM_ADDRESS,
} from './agents';

const SHANNON_CHAIN_ID = 50312;
const SHANNON_CHAIN_NAME = 'Somnia Shannon Testnet';
const SHANNON_RPC_URL = 'https://dream-rpc.somnia.network';

export function getAutoResolveAgentManifest() {
  return {
    name: 'AutoResolve',
    version: 'v17',
    description:
      'Fully autonomous prediction market on Somnia: markets are created and resolved by validator-executed Somnia AI agents (LLM Parse Website + LLM Inference).',
    chain: {
      id: SHANNON_CHAIN_ID,
      name: SHANNON_CHAIN_NAME,
      rpcUrl: SHANNON_RPC_URL,
      explorer: SHANNON_EXPLORER,
    },
    contract: {
      address: CONTRACT_ADDRESS,
      explorerUrl: `${SHANNON_EXPLORER}/address/${CONTRACT_ADDRESS}`,
      platform: SOMNIA_PLATFORM_ADDRESS,
    },
    agents: {
      parseWebsite: {
        id: LLM_PARSE_WEBSITE_AGENT_ID,
        purpose: 'Extract factual evidence from a market resolution source URL.',
      },
      inference: {
        id: LLM_INFERENCE_AGENT_ID,
        purpose:
          'Multi-function LLM: inferString for constrained YES/NO classification, inferToolsChat for on-chain tool calling (creates markets).',
      },
      explorer: AGENTS_EXPLORER,
    },
    autonomousInterface: {
      discover: 'scanResolvableMarkets(uint256 cursor,uint256 limit)',
      discoverCreated: 'scanAgentCreatedMarkets(uint256 cursor,uint256 limit)',
      discoverStuck: 'scanStuckMarkets(uint256 cursor,uint256 limit)',
      discoverStuckGeneration: 'scanStuckGenerationRequests(uint256 cursor,uint256 limit)',
      recover: 'forceResetMarket(uint256 marketId)',
      recoverGeneration: 'forceResetGeneration(uint256 requestId)',
      // v16: cache-aware inference resume. When the parse callback succeeded
      // but the contract was underfunded for the inference call, the contract
      // caches the parse result and emits InferenceUnderfunded. External
      // agents can call this to skip the re-parse and pay only the inference
      // deposit. The relayer is the primary caller; this is documented for
      // other watchtowers.
      retryFromCache: 'retryInferenceFromCache(uint256 marketId) payable',
      inspect: 'getAgentMarketContext(uint256 marketId)',
      invoke: 'requestResolution(uint256 marketId) payable',
      invokeCreation: 'requestMarketGeneration(string topic) payable returns (uint256 requestId)',
      funding: 'getResolutionFundingStatus()',
      fundingCreation: 'getGenerationFundingStatus()',
      manifest: 'agentManifest()',
    },
    creation: {
      agentId: LLM_INFERENCE_AGENT_ID,
      function: 'inferToolsChat',
      trigger: 'requestMarketGeneration(string topic) payable',
      funding: 'getGenerationFundingStatus()',
      discover: 'scanAgentCreatedMarkets(uint256 cursor,uint256 limit)',
      onchainTools: [
        {
          signature: 'createMarket(string,string,uint256)',
          description:
            'Create a binary YES/NO market. question <= 200 chars, source is http(s) URL, durationSeconds in [300, 86400]. Returns the new marketId.',
        },
      ],
      promptTemplate: {
        system:
          'You design binary YES/NO prediction markets. Call createMarket(question,source,durationSeconds) exactly once.',
        userPrefix: 'Topic: ',
      },
      creatorSentinel: '0x00000000000000000000000000000000000000A1',
    },
    judgingAlignment: {
      functionality:
        'Deployed contract supports create (manual + AI), bet, resolve, receipt review, and claim flows. End-to-end autonomous generation is wired through the live LLM Inference agent.',
      agentFirstDesign:
        'Both market creation and resolution are driven by validator-executed Somnia agents. Creation uses LLM Inference inferToolsChat (on-chain tool calling) — the model returns ABI-encoded createMarket calldata that the contract validates and executes.',
      innovation:
        'A generalizable primitive: a permissionless contract whose end-to-end lifecycle (create -> bet -> resolve -> claim) is executable by an external agent without frontend or admin keys.',
      autonomousPerformance:
        'Both creation and resolution run without frontend state. Any external agent can call getGenerationFundingStatus, requestMarketGeneration, scanAgentCreatedMarkets, getResolutionFundingStatus, scanResolvableMarkets, and requestResolution in sequence.',
    },
    proofRun: {
      contractAddress: '0x1631303A748076648a0AbbE077a657Ad7812834F',
      marketId: '1',
      parseRequestId: '2400421',
      inferenceRequestId: '2400485',
      outcome: 'YES',
    },
    latestDeployment: {
      contractAddress: CONTRACT_ADDRESS,
      seededMarkets: ['1', '2'],
      agentDiscoverable: true,
      supportsAutonomousCreation: true,
    },
  };
}
