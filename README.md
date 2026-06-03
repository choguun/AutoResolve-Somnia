# AutoResolve

> **Built for the Somnia Agentathon.** Judges can verify every claim in this README in under 2 minutes — see the [How to verify](#how-to-verify) section at the bottom.

**Fully autonomous prediction markets on Somnia: a Somnia agent creates the market from a topic, validator-executed Somnia agents resolve it after it closes, and the on-chain settlement is the agent's output. No human oracle, no backend resolver, no multisig.**

AutoResolve lets anyone trigger a YES/NO prediction market — manually or by handing a topic to a Somnia agent — stake STT, and let Somnia Agents close the loop. The contract exposes two autonomous pipelines that share the same agent platform:

1. **Creation** — `requestMarketGeneration(topic)` hands a topic to the LLM Inference agent's `inferToolsChat`; the agent returns a `createMarket(question, source, duration)` call. The contract executes it and mints a market with `creator = 0x0000…A1` (the `AGENT_CREATOR_SENTINEL`).
2. **Resolution** — after the market's `endTime`, `requestResolution(marketId)` runs the two-stage agent pipeline. The LLM Parse Website agent extracts evidence from the market's source URL; the LLM Inference agent classifies that evidence as `YES` or `NO`. The final agent callback writes the outcome on-chain and unlocks payouts.

The important part: the AI output is not just displayed in the UI. It changes on-chain contract state, mints new markets, and controls settlement. Two AI systems (creation, resolution) are chained end-to-end and the result is a fully self-driving prediction market.

## Live Submission

| Resource | Link |
|---|---|
| Live app | [autoresolve-somnia.vercel.app](https://autoresolve-somnia.vercel.app) |
| Proof page | [autoresolve-somnia.vercel.app/proof](https://autoresolve-somnia.vercel.app/proof) |
| Agent manifest | [autoresolve-somnia.vercel.app/api/agent-manifest](https://autoresolve-somnia.vercel.app/api/agent-manifest) |
| Well-known agent JSON | [/.well-known/autoresolve-agent.json](https://autoresolve-somnia.vercel.app/.well-known/autoresolve-agent.json) |
| Current contract (v7 — fully autonomous) | [0xd3E9…4B69](https://shannon-explorer.somnia.network/address/0xd3E946aC5aDfCd7772778ce841886BF933b04B69) |
| **v7** AI-created market → AI-resolved end-to-end (parse) | [4254170](https://agents.testnet.somnia.network/receipts/4254170) |
| **v7** AI-created market → AI-resolved end-to-end (inference) | [4254291](https://agents.testnet.somnia.network/receipts/4254291) |
| v2 historical proof (parse) | [2400421](https://agents.testnet.somnia.network/receipts/2400421) |
| v2 historical proof (inference) | [2400485](https://agents.testnet.somnia.network/receipts/2400485) |

## Hackathon Submission Explanation

AutoResolve is a fully autonomous settlement system for prediction markets built on Somnia Shannon Testnet. The project demonstrates how Somnia's Agentic L1 can replace a traditional human oracle, a centralized resolver, AND the market curator: validator-executed agents both **create** and **resolve** markets end-to-end, and the on-chain settlement is their output.

The application has three pieces. First, a Solidity contract stores markets, accepts YES/NO bets, escrows STT, and pays winners proportionally after resolution. Second, the contract integrates directly with Somnia's Agent Platform for two pipelines: a creation pipeline that hands a topic to the LLM Inference agent's `inferToolsChat` and lets the agent call `createMarket(question, source, duration)` back into the contract; and a resolution pipeline that, after the market closes, asks the LLM Parse Website agent to extract evidence from the market source and then asks the LLM Inference agent to classify that evidence as `YES` or `NO`. Third, a Next.js frontend exposes the full user and judge experience: manual and AI-generated market creation, betting, resolution status, validator receipt viewing, and a proof page with a live "Agent Command Center".

During development, we focused on making the project agent-native rather than simply adding AI to a normal dApp. The current v7 contract exposes functions for both pipelines — `requestMarketGeneration`, `scanAgentCreatedMarkets`, `getGenerationFundingStatus` for creation, and `scanResolvableMarkets`, `getAgentMarketContext`, `getResolutionFundingStatus`, `agentManifest` for resolution — so an external agent (or a human via `cast`) can drive the full lifecycle without ever touching the frontend. The `/proof` page includes a live "Agent Command Center" that calls these functions against the deployed contract and shows the autonomous call path in real time.

The project is deployed and has a completed end-to-end proof run on the current v7 contract: an AI agent created market #3 ("Is the capital of France Paris?" with `https://en.wikipedia.org/wiki/Paris` as the source), the same two-stage resolution pipeline ran and produced parse receipt `4254170` and inference receipt `4254291`, the market resolved `YES`, and the on-chain payout is claimable. The v2 contract holds a separate historical proof (parse `2400421`, inference `2400485`, claim tx `0x888327…2380`) that predates the creation feature.

This submission is intended to show a reusable primitive, not only a prediction-market UI. The same agent-callback pattern can settle any contract that depends on real-world facts: insurance claims, sports markets, bounty milestones, DAO grants, and automated escrow releases.

## Why This Needs Somnia

A normal EVM contract can escrow and distribute funds, but it cannot read a website or run an LLM. A normal AI API can classify text, but it cannot create a trust-minimized on-chain settlement result. Somnia Agents bridge that gap: contracts can invoke validator-executed agents, receive asynchronous callbacks, and store the consensus result on-chain.

AutoResolve uses Somnia for the critical path:

- Web evidence extraction through the LLM Parse Website agent.
- Deterministic YES/NO classification through the LLM Inference agent.
- Public agent receipts for verification.
- On-chain callbacks that update market state.
- Agent-discoverable contract methods for autonomous operation.

## Judging Criteria Alignment

| Criterion | What AutoResolve Shows |
|---|---|
| Functionality | Deployed app and contract support manual create, AI-generated create, bet, resolve, receipt review, and claim flows. |
| Agent-First Design | Both creation and resolution are Somnia-agent driven. The contract also exposes discovery/context functions for both pipelines so an external agent can run the full lifecycle without the UI. |
| Innovation & Technical Creativity | First prediction market where the same validator-executed agents that resolve a market can also create it. A single on-chain `createRequest` → `handleGenerationCallback` loop replaces both the oracle AND the curator. |
| Autonomous Performance | Any external agent can discover a topic, generate a market, fund the inference deposit, and resolve the result. No human interaction is required at any point in the loop. |

## Architecture

```text
                  CREATION PIPELINE
=====================================================
   User (or any agent) — topic string
        |
        v
   requestMarketGeneration(topic) payable
        |
        v
   AutonomousPredictionMarket.sol
        |
        | createRequest(inferToolsChat,
        |              tool = createMarket)
        v
   Somnia LLM Inference Agent (validator-run)
        |
        | callback with createMarket(question,
        |                            source,
        |                            duration)
        v
   AutonomousPredictionMarket.sol
   -> marketId minted, creator = AGENT_CREATOR_SENTINEL


                  RESOLUTION PIPELINE
=====================================================
   User (or any agent) — marketId
        |
        v
   requestResolution(marketId) payable
        |
        v
   AutonomousPredictionMarket.sol
        |
        | createRequest(parse: ExtractString)
        v
   Somnia LLM Parse Website Agent (validator-run)
        |
        | callback with extracted evidence
        v
   AutonomousPredictionMarket.sol
        |
        | createRequest(inference: inferString)
        v
   Somnia LLM Inference Agent (validator-run)
        |
        | callback with YES/NO
        v
   AutonomousPredictionMarket.sol
   -> market.outcome written, status = Resolved,
      payouts unlocked

Verification:
  Agent receipts -> agents.testnet.somnia.network
  On-chain txs  -> shannon-explorer.somnia.network
```

## Why AutoResolve, Not The Status Quo

The oracle problem is the bottleneck of every prediction market. Today, projects solve it three ways; AutoResolve replaces all three with a single on-chain agent callback.

| | **UMA** | **Chainlink** | **Augur** | **AutoResolve (Somnia)** |
|---|---|---|---|---|
| **Who decides the answer** | Human voters in a dispute round | Pre-curated node operators | Human reporters + multi-round dispute | Validator-executed LLM agents |
| **Time to resolution** | 1–7 days (depends on dispute) | Minutes (if data is structured) | Days (depends on dispute rounds) | Minutes (single async callback) |
| **On-chain primitive** | Optimistic oracle + staking contract | Aggregator contract (off-chain nodes) | Share-based consensus + dispute contract | `createRequest` → `handleAgentResponse` on the market contract |
| **Source of truth** | Whatever voters accept as truth | Whatever nodes agree on | Whatever reporters + dispute accepts | Deterministic LLM output over a public source |
| **Public verifiability** | Per-voter signatures, off-chain discourse | Per-node responses, gated by node reputation | Dispute log, human-readable but slow | **Per-validator receipts with full agent I/O on agents.testnet.somnia.network** |
| **Can a creator/manipulate a result** | Yes, via voter bribing | No (node consensus), but no on-chain audit trail of reasoning | Yes, via reporter bribing | No — validator output is the settlement input |
| **Requires humans in the loop** | Yes (voters) | No for routine price feeds, yes for setup | Yes (reporters + disputers) | **No** — the agent callback is the final write |

AutoResolve is the first prediction-market primitive that lets a contract ask an LLM a question, wait for validator consensus, and settle money in a single async loop. There is no multisig, no admin oracle, and no off-chain resolver server.

## Contract

Current deployment:

```text
AutonomousPredictionMarket v7 (fully autonomous — creation + resolution)
0xd3E946aC5aDfCd7772778ce841886BF933b04B69
```

Core functions:

| Function | Description |
|---|---|
| `createMarket(question, source, duration)` | Manually create a YES/NO market (creator = `msg.sender`). |
| `bet(marketId, option)` | Stake STT on YES or NO. |
| `requestMarketGeneration(string topic) payable` | Hand a topic to the LLM Inference agent's `inferToolsChat`; the agent calls `createMarket` back into the contract. New markets are minted with `creator = AGENT_CREATOR_SENTINEL` (`0x0000…A1`). |
| `requestResolution(marketId)` | Trigger the two-stage Somnia agent resolver. |
| `claimWinnings(marketId)` | Claim proportional payout for the winning side. |
| `scanResolvableMarkets(cursor, limit)` | Let external agents discover expired markets ready for resolution. |
| `scanAgentCreatedMarkets(cursor, limit)` | Let external agents discover markets created by the inference agent. |
| `getAgentMarketContext(marketId)` | Return question, source, funding, status, and request IDs for agents. |
| `getResolutionFundingStatus()` | Return required deposit, contract balance, and top-up needed for resolution. |
| `getGenerationFundingStatus()` | Return required deposit, contract balance, and top-up needed for creation. |
| `agentManifest()` | On-chain description of the autonomous interface. |

Sentinel + constants:

| Symbol | Value |
|---|---|
| `AGENT_CREATOR_SENTINEL` | `0x00000000000000000000000000000000000000A1` — `creator` value for AI-created markets; the UI shows a "Created by AI" badge for this address |
| Agent Platform | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| LLM Parse Website Agent | `12875401142070969085` |
| LLM Inference Agent | `12847293847561029384` (used for both `inferString` resolution and `inferToolsChat` creation) |
| Chain | Somnia Shannon Testnet |
| Chain ID | `50312` |
| RPC | `https://dream-rpc.somnia.network` |

## Proof Artifacts

Latest v7 deployment — fully autonomous creation + resolution:

- Contract: [0xd3E946aC5aDfCd7772778ce841886BF933b04B69](https://shannon-explorer.somnia.network/address/0xd3E946aC5aDfCd7772778ce841886BF933b04B69)
- Prefund: prefilled with enough STT to cover creation and resolution inference deposits.
- Test coverage: 52/52 Foundry tests pass locally (36 v4 baseline + 16 v5/v7 creation-pipeline tests).

Completed E2E run on the v7 contract — AI agent created the market, AI agents resolved it:

- Market #3 (AI-created): "Is the capital of France Paris?" — `creator = 0x0000…A1`
- Source URL (chosen by the LLM agent): `https://en.wikipedia.org/wiki/Paris`
- Yes pool: 0.01 STT, No pool: 0.005 STT
- Parse agent receipt: [4254170](https://agents.testnet.somnia.network/receipts/4254170) — extracted `outcome = "Yes"`
- Inference agent receipt: [4254291](https://agents.testnet.somnia.network/receipts/4254291) — final classification `YES`
- Resolution requested (parse) tx: [`0xc8457e94…1c31c`](https://shannon-explorer.somnia.network/tx/0xc8457e941883f0bbc3108ac0206575e80c42bb0666515c24262517ff8ae1c31c)
- Resolution requested (inference) tx: [`0x0b30f326…392ce`](https://shannon-explorer.somnia.network/tx/0x0b30f326d06a85ac6422bab93a7cfe8616b47356987799768b3afb5a0cc392ce)
- Market resolved tx (YES): [`0x362daa6f…b5143`](https://shannon-explorer.somnia.network/tx/0x362daa6f16fd4b84b1d832867dcb679225a0f1364d58dda2ccd36234000b5143)
- Outcome: `YES` — winnings claimable via `claimWinnings(3)`

Historical E2E proof on the v2 contract (predates the creation feature):

- Market #1: "Is the capital of France Paris?" — `creator = 0x119F…5fD6` (human-seeded)
- Source: `https://en.wikipedia.org/wiki/Paris`
- Parse agent receipt: [2400421](https://agents.testnet.somnia.network/receipts/2400421)
- Inference agent receipt: [2400485](https://agents.testnet.somnia.network/receipts/2400485)
- Outcome: `YES`
- Claim tx: [0x888327…2380](https://shannon-explorer.somnia.network/tx/0x8883273b0bb83dbb7f2cb489b7a5b54b9a7591afeaee58bd472e7fb5b57c2380) — 0.03 STT winnings paid to the YES bettor

## Demo Flow

1. Open [the proof page](https://autoresolve-somnia.vercel.app/proof).
2. Show the **Live Autonomous Resolver Console** (resolution side) and the **AI Generation Pipeline** card (creation side).
3. Point out `scanResolvableMarkets`, `scanAgentCreatedMarkets`, `getAgentMarketContext`, both funding statuses, and the live market list with the "Created by AI" badge.
4. Open the completed v7 parse and inference receipts ([`4254170`](https://agents.testnet.somnia.network/receipts/4254170), [`4254291`](https://agents.testnet.somnia.network/receipts/4254291)) and the v2 historical proof ([`2400421`](https://agents.testnet.somnia.network/receipts/2400421), [`2400485`](https://agents.testnet.somnia.network/receipts/2400485)).
5. Open the main app, go to `/create`, and show the **Manual** and **AI-Generated** tabs. The AI-Generated tab triggers `requestMarketGeneration(topic)`; the resulting market appears on `/` with the "Created by AI" badge.
6. Connect a wallet on Somnia Shannon, place a bet on any market, and request resolution after the market's `endTime`.
7. Show the resolution timeline and claim flow.

If live agent execution takes longer than the pitch slot, use the v7 proof receipts `4254170` and `4254291`, or the v2 historical proof `2400421` and `2400485`.

## Tech Stack

| Layer | Technology |
|---|---|
| Contracts | Foundry, Solidity 0.8.24 |
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Web3 | wagmi v2, viem, RainbowKit |
| Data | TanStack Query |
| Chain | Somnia Shannon Testnet |
| Deploy | Vercel |

## Local Development

### Prerequisites

- Foundry
- Node.js 18+
- pnpm
- STT on Somnia Shannon Testnet
- WalletConnect Cloud project ID

### Install

```bash
git clone https://github.com/choguun/AutoResolve-Somnia.git
cd AutoResolve-Somnia
pnpm install
forge build
pnpm export-abi
```

### Configure

```bash
cp .env.example .env
```

```env
PRIVATE_KEY=your_deployer_private_key
SHANNON_RPC_URL=https://dream-rpc.somnia.network
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_CONTRACT_ADDRESS=0xd3E946aC5aDfCd7772778ce841886BF933b04B69
```

### Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Testing

```bash
pnpm lint
pnpm build
forge test -vv
```

Current contract test coverage includes:

- Market creation validation (manual and agent paths).
- Betting and proportional payouts.
- Winner cannot claim twice.
- Missing market guards.
- Resolution top-up accounting.
- Parse/inference callback success and failure.
- Unauthorized callback rejection.
- Invalid LLM output reopening the market.
- Agent discovery and context scanning.
- `requestMarketGeneration` happy path, refund math, empty/long topic, callback-only-platform, `nonReentrant`.
- `scanAgentCreatedMarkets` paginates markets whose `creator == AGENT_CREATOR_SENTINEL`.

## Deployment

Contract deployment:

```bash
./scripts/deploy.sh
```

Frontend deployment:

```bash
pnpm exec vercel deploy --prod
```

This repo includes `vercel.json` to force Vercel to build the app as Next.js.

## How to verify

Every claim in this README can be independently verified in under two minutes. Walk through the steps below in order — they form a complete trust ladder from "it exists" to "the agents actually ran it."

### Step 1 — The app is live

Open [autoresolve-somnia.vercel.app](https://autoresolve-somnia.vercel.app). The home page shows the live market list, the proof page (`/proof`) shows the deployed contract, the live RPC, and seeded markets that any wallet can interact with. No login. No demo mode. The data is real.

### Step 2 — The contract is on Shannon

Open the deployed v7 contract in Shannon Explorer:

- Contract: [`0xd3E946aC5aDfCd7772778ce841886BF933b04B69`](https://shannon-explorer.somnia.network/address/0xd3E946aC5aDfCd7772778ce841886BF933b04B69)
- The "Contract" tab will show the verified source code (see the verification step in `DEPLOYED.md`).
- The "Transactions" tab will show the deploy tx, the prefund, the two seeded markets, market #3 (AI-created), the resolution pipeline txs, and the `MarketResolved` event.

### Step 3 — The agents actually ran (current v7 proof)

The v7 contract ran an end-to-end proof where the **AI agent created the market and the AI agents resolved it**. Market #3 is the artifact — `creator = 0x0000…A1` (the `AGENT_CREATOR_SENTINEL`):

- **Parse agent** (extracted `outcome = "Yes"` from the source URL the inference agent chose): [receipt `4254170`](https://agents.testnet.somnia.network/receipts/4254170)
- **Inference agent** (final classification `YES`): [receipt `4254291`](https://agents.testnet.somnia.network/receipts/4254291)
- **Market resolved** on-chain: tx [`0x362daa6f…b5143`](https://shannon-explorer.somnia.network/tx/0x362daa6f16fd4b84b1d832867dcb679225a0f1364d58dda2ccd36234000b5143) — `MarketResolved(marketId=3, outcome=YES, reason="YES")`

Inside the same app:

- Open [`/receipt/4254170`](https://autoresolve-somnia.vercel.app/receipt/4254170) for the parse receipt.
- Open [`/receipt/4254291`](https://autoresolve-somnia.vercel.app/receipt/4254291) for the inference receipt.

You will see the validator subcommittee (3 nodes), each validator's individual output, the consensus result, and the agent's raw API response. The receipt pages in the app normalize the raw payload into a timeline.

### Step 4 — The on-chain settlement matches the agent output

Receipt `4254291` says the inference agents returned `YES` for the question "Is the capital of France Paris?" on a market the inference agent itself created. Follow the receipt to the on-chain resolution:

- Market resolved tx: [`0x362daa6f16fd4b84b1d832867dcb679225a0f1364d58dda2ccd36234000b5143`](https://shannon-explorer.somnia.network/tx/0x362daa6f16fd4b84b1d832867dcb679225a0f1364d58dda2ccd36234000b5143)

Open it in Shannon Explorer. The transaction input is the inference callback from the Somnia platform; the log shows `MarketResolved(3, YES, "YES", …)`. The agent's answer (`YES`) became the contract's stored outcome; the contract's stored outcome unlocks `claimWinnings(3)` for the YES bettor. The chain of custody is complete.

For the historical v2 E2E proof (with a recorded claim tx), receipts `2400421` + `2400485` + claim tx [`0x888327…2380`](https://shannon-explorer.somnia.network/tx/0x8883273b0bb83dbb7f2cb489b7a5b54b9a7591afeaee58bd472e7fb5b57c2380) remain valid.

### Step 5 — The tests pass

The contract is fully covered by Foundry tests. From the repo root:

```bash
forge test -vv
```

You should see all tests green, including parse-callback success, parse-callback failure, inference-callback success, inference-callback failure, unauthorized callback rejection, payout math, double-claim prevention, agent context scanning, and reentrancy.

### Step 6 — The contract exposes an agent-discoverable interface (both pipelines)

External autonomous agents do not need the frontend. The contract itself answers:

```bash
# Resolution side
cast call 0xd3E946aC5aDfCd7772778ce841886BF933b04B69 \
  "scanResolvableMarkets(uint256,uint256)" 0 10 \
  --rpc-url https://dream-rpc.somnia.network

cast call 0xd3E946aC5aDfCd7772778ce841886BF933b04B69 \
  "getAgentMarketContext(uint256)" 3 \
  --rpc-url https://dream-rpc.somnia.network

cast call 0xd3E946aC5aDfCd7772778ce841886BF933b04B69 \
  "getResolutionFundingStatus()" \
  --rpc-url https://dream-rpc.somnia.network

# Creation side
cast call 0xd3E946aC5aDfCd7772778ce841886BF933b04B69 \
  "scanAgentCreatedMarkets(uint256,uint256)" 0 10 \
  --rpc-url https://dream-rpc.somnia.network

cast call 0xd3E946aC5aDfCd7772778ce841886BF933b04B69 \
  "getGenerationFundingStatus()" \
  --rpc-url https://dream-rpc.somnia.network

cast call 0xd3E946aC5aDfCd7772778ce841886BF933b04B69 \
  "agentManifest()" \
  --rpc-url https://dream-rpc.somnia.network
```

The same answers power the `Agent Command Center` widget on the live `/proof` page. A second agent — written by anyone — can drive both the creation and resolution flows without the UI: discover a topic, generate a market, fund the inference deposit, and resolve the result.

## Known limitations

AutoResolve is a hackathon build. To stay focused on the agent-callback primitive, the current implementation intentionally leaves the following for post-deadline work. None of these affect the demo path.

- **Binary markets only.** The contract supports `YES` / `NO`. Multi-outcome markets require richer storage.
- **No dispute window.** Once an inference callback writes a result, it is final. A future version will add a time-bounded dispute path backed by staked challengers.
- **No fee model.** Winners currently receive the full proportional payout. A protocol fee + treasury is straightforward to add.
- **Source quality is user-supplied.** The contract does not enforce an allowlist of source domains. A future version can constrain sources or require a creator bond.
- **Failed agent resolution reverts to retry, not dispute.** If parse or inference fails, the market returns to `Open` and a new `requestResolution` call can retry.

## License

MIT
