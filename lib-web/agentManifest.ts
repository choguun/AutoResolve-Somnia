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
    // v25 (H1): bumped from v22 → v24 to match the live frontend. The manifest
    // is served by the frontend, so the version label tracks the frontend. The
    // on-chain `agentManifest()` still returns "AutoResolve agent interface
    // v19." and is the authoritative source for the contract-side surface.
    // External agents should call both: the JSON manifest for the
    // frontend/UX version, and the on-chain view for the contract version.
    // The proof page reads this field as the single source of truth for its
    // "Frontend vN" pill (v24 H2 split the Frontend/Contract labels).
    // v29 (H1): bumped v24 → v29 to advertise the new relayer-driven topic
    // feed (drainTopicFeed) that closes the last "human in the loop" gap in
    // the fully-autonomous pipeline. Track the live frontend version in
    // lockstep with CLAUDE.md "Live app".
    // v30 (H0): bumped v29 → v30 — the v29 relayer was crashing on startup
    // with a TDZ ReferenceError (the startup console.log at L155 referenced
    // consts declared further down the file). v30 hoists the v29 consts
    // above the startup log group, and adds a `pnpm relayer:smoke` step
    // (scripts/relayer-smoke.sh) so future relayer-side crashes are caught
    // at verification time — `pnpm lint` + `pnpm build` + `forge test` never
    // execute the relayer, which is how v29's crash shipped silently.
    // v31 (H0): bumped v30 → v31 — drainTopicFeed now waits for the tx
    // receipt before adding the topic to the persistent submittedTopics
    // Set. v30 H1 had reordered pre-flight/add/submit but still trusted
    // writeContract's hash return as "submitted" — a contract-level
    // InsufficientContractBalance revert (e.g. another actor drained the
    // contract's STT balance in the same block) would refund the deposit
    // to the relayer EOA but leave the topic in the Set, requiring a
    // hand-edit of state/submitted-topics.<eoa>.json to recover. v31
    // closes the same theme as v30 H1: don't trust the relayer's local
    // view of "this topic is done"; verify on-chain via the receipt.
    // v32 (H0+H1): bumped v31 → v32 — two fixes.
    // H0: the manifest's `promptTemplate.system` field was semantically
    // wrong when populated from the live contract (the contract has no
    // system role — just a single user message of "<prefix><topic><suffix>").
    // Renamed to `userSuffix` in both route handlers and updated the
    // static fallback in agentManifest.ts to use the v7 SPECIFIC-URL +
    // SHORT-duration prompt text the live contract encodes.
    // H1: drainTopicFeed's Set-add now uses a sync disk write instead of
    // the 5s-debounced scheduleSubmittedTopicsSave. A SIGKILL between
    // the in-memory add and the debounce's disk flush was the residual
    // race: next boot re-read the old file and re-submitted the topic,
    // burning a second inference deposit. Also bumps drainTopicFeed's
    // waitForTransactionReceipt to 60s timeout (v32 L0) so a stuck tx
    // can't block the main loop indefinitely.
    version: 'v32',
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
            'Create a binary YES/NO market. question <= 500 chars (MAX_QUESTION_LENGTH), source is http(s) URL, durationSeconds in [300, 86400] (MIN_DURATION..MAX_DURATION; prefer [300, 600] for fast resolution). Returns the new marketId.',
        },
      ],
      // v25 (L3): the prompt template is no longer hardcoded. The route
      // handlers (/api/agent-manifest, /.well-known/autoresolve-agent.json)
      // merge `getGenerationPromptTemplate()` into this object at response
      // time, so the manifest reflects the on-chain source-of-truth. If the
      // contract is unreachable the field is omitted rather than guessed.
      // The static `userPrefix` string is kept as a fallback for the proof
      // page (which renders a static description) — see CLAUDE.md note:
      // these are documentation, not the live prompt.
      // v32 (H0): the live contract sends a SINGLE user message of
      // "<prefix><topic><suffix>" — there is no system role. The previous
      // static fallback labeled a non-existent `system` field, which would
      // mislead external agents. Renamed to `userSuffix` to match the
      // actual model architecture; the text is the v7 SPECIFIC-URL +
      // SHORT-duration guidance the live contract prompt encodes (the
      // older static text was missing both requirements, which is what
      // blocked AI-created → AI-resolved markets until v7).
      promptTemplate: {
        userPrefix: 'Design a binary YES/NO prediction market on this topic. ',
        userSuffix:
          ' You MUST call createMarket(question, source, durationSeconds) exactly once. ' +
          'question <= 500 chars. The source URL MUST be a SPECIFIC article or page that directly states the answer to the YES/NO question (e.g. https://en.wikipedia.org/wiki/Paris NOT https://en.wikipedia.org/). ' +
          'Prefer a SHORT duration in [300, 600] seconds so the market can resolve quickly.',
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
        'Both creation and resolution run without frontend state. Any external agent can call getGenerationFundingStatus, requestMarketGeneration, scanAgentCreatedMarkets, getResolutionFundingStatus, scanResolvableMarkets, and requestResolution in sequence. v29 ships a topic-feed relayer (scripts/relayer.mjs drainTopicFeed) that closes the last human-in-the-loop gap: it reads scripts/topics.txt (or $GENERATION_TOPICS_FILE) on every tick and submits requestMarketGeneration for any topic not already in state/submitted-topics.<eoa>.json. v30 hoists the v29 consts above the startup console.log group (the v29 startup crashed with a TDZ ReferenceError — the relayer was offline) and adds pnpm relayer:smoke as the missing piece in the verification triangle, since `pnpm lint` + `pnpm build` + `forge test` never execute the relayer. v31 makes drainTopicFeed wait for the tx receipt before adding the topic to the persistent Set, closing a residual of v30 H1: a contract-level InsufficientContractBalance revert (e.g. another actor draining the contract balance in the same block) used to refund the deposit to the relayer EOA while leaving the topic in submitted-topics.json, requiring a hand-edit to recover. v32 makes the Set-add write synchronously to disk (closing a SIGKILL race that would re-submit on next boot) and renames the manifest `promptTemplate.system` field to `userSuffix` because the contract sends a single user message of "<prefix><topic><suffix>" — there is no system role.',
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
