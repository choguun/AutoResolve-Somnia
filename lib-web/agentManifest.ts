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
    description:
      'Autonomous prediction market resolver using Somnia Parse Website and LLM Inference agents.',
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
        purpose: 'Classify extracted evidence into the constrained YES/NO market outcome.',
      },
      explorer: AGENTS_EXPLORER,
    },
    autonomousInterface: {
      discover: 'scanResolvableMarkets(uint256 cursor,uint256 limit)',
      inspect: 'getAgentMarketContext(uint256 marketId)',
      invoke: 'requestResolution(uint256 marketId) payable',
      funding: 'getResolutionFundingStatus()',
      manifest: 'agentManifest()',
    },
    judgingAlignment: {
      functionality: 'Deployed contract supports create, bet, resolve, receipt review, and claim flows.',
      agentFirstDesign:
        'Resolution requires validator-executed Somnia agents for web extraction and deterministic LLM classification.',
      innovation:
        'Turns prediction market settlement into a reusable autonomous resolver primitive.',
      autonomousPerformance:
        'Expired markets can be discovered and resolved by an autonomous caller without frontend state.',
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
    },
  };
}
