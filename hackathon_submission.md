# Hackathon Submission — AutoResolve

## Project Description

**Autonomous Prediction Market Resolver** — the first fully on-chain, agent-powered prediction market that resolves itself using Somnia's LLM agents. No humans, no disputes, no centralized backend. Every outcome is decided by a two-stage Somnia Agent workflow whose callbacks write the result directly into contract state.

## How we incorporate the selected challenge

AutoResolve is an agent-driven prediction market where the hardest part — outcome resolution — is performed autonomously through Somnia's Agentic L1. When a market closes, the smart contract invokes a two-stage agent workflow:

1. **LLM Parse Website agent** extracts factual evidence from the market's source URL.
2. **LLM Inference agent** classifies that evidence into a constrained YES/NO outcome.

The final agent callback writes the result on-chain and unlocks winner payouts.

This incorporates the challenge in three concrete ways:

### 1. Agent-native execution

The application depends on Somnia Agents for functionality that normal smart contracts cannot perform: reading web sources, extracting evidence, and running LLM inference. Without the agent layer, the protocol cannot resolve markets autonomously. The whole point of the system is to make this loop self-running.

### 2. Autonomous operation

The deployed contract exposes `scanResolvableMarkets`, `scanAgentCreatedMarkets`, `getAgentMarketContext`, `getResolutionFundingStatus`, `getGenerationFundingStatus`, and `agentManifest()`. An external resolver agent can discover expired markets, inspect funding/source context, and invoke resolution without relying on frontend state. The relayer (`scripts/relayer.mjs`) is exactly that — a Node.js process that watches the chain, calls these methods, and submits the resolution tx. Judges can run their own resolver against the same contract surface.

### 3. High-impact primitive

The implementation is more than a prediction market UI. It demonstrates a reusable autonomous settlement layer for any contract that needs to settle based on real-world facts: insurance claims, sports markets, DAO milestone payouts, bounties, and escrow releases. The contract's `getAgentMarketContext` view is the canonical shape any such settlement layer would expose.

## Detailed explanation

AutoResolve is a complete autonomous settlement system for prediction markets, built and live on Somnia Shannon Testnet. It replaces the traditional human oracle or centralized backend resolver with a validator-executed Somnia Agent workflow.

### Stack

- **Solidity contract** (`src/AutonomousPredictionMarket.sol`, ~485 lines, 113/113 Foundry tests pass): stores YES/NO markets, accepts STT bets, escrows funds, triggers resolution after market close, and pays winners proportionally. The contract is the v19+v40+v45 ABI, deployed at `0xc7d1A923A5a5C90d3134aAD2Abd508D192468f4f` on Shannon Testnet.
- **Next.js frontend** (`app/`): markets list, bet panel, resolution status, and a `/proof` page that surfaces the live agent pipeline. Tailwind + wagmi + viem + TanStack Query. Deployed at `autoresolve-somnia.vercel.app`.
- **Relayer** (`scripts/relayer.mjs`, ~2400 lines): an always-on Node.js process that watches the chain, auto-resolves expired markets, auto-creates markets from a topic feed, auto-seeds liquidity, auto-funds the contract, and auto-claims winnings. Deployed on Railway. v68 in production.

### How the autonomous loop works

1. **Create market**: a user (or the inference agent) calls `createMarket(question, source, duration)`. The market enters `Open` state.
2. **Place bets**: users (or the relayer's auto-seed) call `bet(marketId, Yes|No)` with STT. The market tracks `yesTotal`, `noTotal`, and per-user positions.
3. **Resolve**: when `endTime` passes, anyone calls `requestResolution(marketId)`. The contract invokes Somnia's LLM Parse Website agent with the source URL. The parse callback calls `_resolveWithLLMInference`, which invokes the LLM Inference agent with a constrained YES/NO prompt. The final inference callback writes the outcome on-chain and emits `MarketResolved`.
4. **Claim**: winners call `claimWinnings(marketId)` to receive their share of the pool, proportional to their contribution.

The relayer watches for `ResolutionFailed` events and re-submits on transient failures. It also watches the parse-failure LRU and retries markets when the URL is evicted.

### What the judges can verify

- **Live frontend**: `https://autoresolve-somnia.vercel.app` — markets list, bet panel, resolution timeline.
- **Proof page**: `https://autoresolve-somnia.vercel.app/proof` — live Agent Command Center calling `getAgentMarketContext` and `getResolutionFundingStatus` against the live contract in real time.
- **Contract on-chain**: `0xc7d1A923A5a5C90d3134aAD2Abd508D192468f4f` on Shannon Testnet. 113/113 Foundry tests pass.
- **Agent manifest**: `https://autoresolve-somnia.vercel.app/api/agent-manifest` — the machine-readable surface external agents use to discover and resolve markets.
- **Agent discovery**: `https://autoresolve-somnia.vercel.app/.well-known/autoresolve-agent.json` — well-known discovery endpoint.
- **Stranded-seed observability**: `https://autoresolve-somnia.vercel.app/api/stranded-seeds` — a derived list of markets where the relayer's auto-seed has not yet resolved (the `StrandedSeedsCard` on `/proof` renders the count + per-market detail).
- **Historical E2E proof**: market #1 on the v2 contract resolved `YES` via parse receipt `2400421` and inference receipt `2400485`. The v7 contract also has a full AI-created→AI-resolved proof (market #3).
- **Fresh E2E proof (v55+)**: the live v19+v40+v45 contract has 9 AI-created markets in the `0xA1` creator-sentinel class. The relayer's first topic-feed submission created market #5 ("Will Somnia mainnet launch before 2027?") on the new contract. The relayer's auto-seed feature has placed 0.01 STT YES + 0.01 STT NO on every Open market, and the v65 backfill has ensured the 7 markets created before the v62 auto-seed feature was enabled are also seeded. The dApp's `StrandedSeedsCard` shows `count: 9, totalStrandedStt: "0.180"`.

### v68 features shipped end-to-end

- **Relayer-driven auto-liquidity** (v62): when enabled via `RELAYER_LIQUIDITY_STT=0.01`, the relayer auto-seeds 0.01 STT YES + 0.01 STT NO on every newly-created market. On `MarketResolved`, the relayer auto-claims winnings. Opt-in via env var (default off).
- **Periodic partial-seed retry** (v66+v67): the relayer detects Somnia state-trie partial seeds (where `userNoBets` and `marketBets.push` commit but `market.noTotal` is rolled back) and retries the missing side on every tick with a 60-attempt cap. Bounded retry budget prevents runaway drain.
- **Stranded-seed observability** (v64+v65+v66+v67): the dApp's `/api/stranded-seeds` endpoint derives the stranded set from on-chain data (`getUserMarkets` + `getMarket` + `getMarketBets`). A `StrandedSeedsCard` on `/proof` polls the endpoint and renders count + total STT locked + per-market detail with a "partial" pill for partial-seed markets.
- **Backfill-on-startup** (v65): the relayer scans `[1, nextMarketId)` on the first tick after startup and seeds any Open market where the relayer EOA hasn't already placed the YES+NO seed. Catches markets created before the v62 auto-seed feature was enabled.
- **Relayer-driven auto-funding** (v68): the relayer tops up the contract's STT balance whenever it falls below `RELAYER_AUTO_FUND_STT` (default 0 = disabled). The refill is bounded by `min(0.1 * EOA balance, RELAYER_AUTO_FUND_MAX_PER_REFILL_STT default 2 STT)` so a single tick can't blow the operator's wallet. The contract's `receive()` function already accepts plain STT transfers; no contract bytecode change was needed.

### Why this is a generalizable primitive

AutoResolve demonstrates a reusable pattern: contracts that settle based on real-world facts without human oracles. The same shape — `(question, source, duration)` + two-stage agent pipeline + on-chain outcome — applies to:

- **Insurance claims**: "Did the flight arrive on time?" — the contract reads the airline's status page via the Parse agent, the Inference agent classifies on-time/late, the contract pays out.
- **Sports markets**: "Did Team A win the match?" — read the score from a sports API, infer the winner.
- **DAO milestone payouts**: "Did the team ship the milestone by the deadline?" — read the GitHub PR, infer pass/fail.
- **Bounties**: "Did the contributor resolve the issue?" — read the issue tracker, infer.
- **Escrow releases**: "Did both parties sign the contract?" — read the doc-signing service, infer.

The contract's `getAgentMarketContext` view is the canonical shape any such settlement layer would expose. An external agent can call this view + `requestResolution` to settle a market — no frontend needed.

### Conclusion

AutoResolve is the first fully autonomous settlement system for prediction markets on Somnia. The Somnia Agent Platform is the centerpiece of the protocol: without it, no resolution; with it, every market is verifiable on-chain. The contract, frontend, and relayer are all deployed and live. The relayer runs in a self-recovering loop (auto-resolve, auto-seed, auto-claim, auto-fund). The dApp surface is stable. 113/113 Foundry tests pass. The system has been hardened through 28 shipped audit cycles (v8–v68) with no contract bytecode change since v19.
