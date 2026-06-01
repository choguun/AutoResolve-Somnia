# AutoResolve

> **Built for the Somnia Agentathon.** Judges can verify every claim in this README in under 2 minutes — see the [How to verify](#how-to-verify) section at the bottom.

**Autonomous prediction markets on Somnia where the resolution layer is a validator-executed agent workflow, not a human oracle.**

AutoResolve lets anyone create YES/NO prediction markets, stake STT, and let Somnia Agents resolve the final outcome. After a market ends, the contract triggers a two-stage agent pipeline:

1. **LLM Parse Website** extracts factual evidence from the market's source URL.
2. **LLM Inference** classifies the evidence into a constrained `YES` or `NO` result.
3. The Somnia Agent Platform calls back into the contract, which records the outcome and unlocks payouts.

The important part: the AI result is not just displayed in the UI. It changes on-chain contract state and controls settlement.

## Live Submission

| Resource | Link |
|---|---|
| Live app | [autoresolve-somnia.vercel.app](https://autoresolve-somnia.vercel.app) |
| Proof page | [autoresolve-somnia.vercel.app/proof](https://autoresolve-somnia.vercel.app/proof) |
| Agent manifest | [autoresolve-somnia.vercel.app/api/agent-manifest](https://autoresolve-somnia.vercel.app/api/agent-manifest) |
| Well-known agent JSON | [/.well-known/autoresolve-agent.json](https://autoresolve-somnia.vercel.app/.well-known/autoresolve-agent.json) |
| Current contract | [0xE364...8DFC](https://shannon-explorer.somnia.network/address/0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC) |
| Completed parse receipt | [2400421](https://agents.testnet.somnia.network/receipts/2400421) |
| Completed inference receipt | [2400485](https://agents.testnet.somnia.network/receipts/2400485) |

## Hackathon Submission Explanation

AutoResolve is an autonomous settlement system for prediction markets built on Somnia Shannon Testnet. The project demonstrates how Somnia's Agentic L1 can replace a traditional human oracle or centralized backend resolver with validator-executed agents.

The application has three main pieces. First, a Solidity contract stores markets, accepts YES/NO bets, escrows STT, and pays winners proportionally after resolution. Second, the contract integrates directly with Somnia's Agent Platform. When a market closes, anyone can call `requestResolution`; the contract asks the LLM Parse Website agent to extract evidence from the market source, then asks the LLM Inference agent to classify that evidence as `YES` or `NO`. The final agent callback writes the resolved outcome on-chain. Third, the Next.js frontend exposes the full user and judge experience: market creation, betting, resolution status, validator receipt viewing, and a proof page.

During development, we focused on making the project agent-native rather than simply adding AI to a normal dApp. The latest v3 contract exposes functions such as `scanResolvableMarkets`, `getAgentMarketContext`, `getResolutionFundingStatus`, and `agentManifest`, so an external autonomous resolver can discover expired markets, inspect source/funding context, and invoke resolution without relying on frontend state. The `/proof` page includes a live "Agent Command Center" that calls these functions against the deployed contract and shows the autonomous call path in real time.

The project is deployed and has a completed end-to-end proof run from an earlier deployment: market #1 asked whether Paris is the capital of France, the Parse Website agent produced receipt `2400421`, the Inference agent produced receipt `2400485`, the market resolved `YES`, and winnings were claimed on-chain. The current v3 deployment is prefunded with 1 STT and seeded with two demo markets for live testing.

This submission is intended to show a reusable primitive, not only a prediction-market UI. The same pattern can be used for any contract that needs to settle based on real-world facts: insurance claims, sports markets, bounty milestones, DAO grants, and automated escrow releases.

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
| Functionality | Deployed app and contract support create, bet, resolve, receipt review, and claim flows. |
| Agent-First Design | Resolution requires Somnia agents; the contract also exposes discovery/context functions for external resolver agents. |
| Innovation & Technical Creativity | Turns the prediction-market oracle layer into an autonomous, reusable settlement primitive. |
| Autonomous Performance | Expired markets can be discovered, inspected, funded, and resolved without frontend state. |

## Architecture

```text
User or autonomous resolver
        |
        v
Next.js UI or direct contract call
        |
        v
AutonomousPredictionMarket.sol
        |
        | createRequest(parse)
        v
Somnia LLM Parse Website Agent
        |
        | callback with extracted evidence
        v
AutonomousPredictionMarket.sol
        |
        | createRequest(inference)
        v
Somnia LLM Inference Agent
        |
        | callback with YES/NO
        v
Resolved market + claimable payouts

Verification:
Agent receipts -> agents.testnet.somnia.network
On-chain txs -> shannon-explorer.somnia.network
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
AutonomousPredictionMarket v4 (hardened)
0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC
```

Core functions:

| Function | Description |
|---|---|
| `createMarket(question, source, duration)` | Create a YES/NO market. |
| `bet(marketId, option)` | Stake STT on YES or NO. |
| `requestResolution(marketId)` | Trigger the two-stage Somnia agent resolver. |
| `claimWinnings(marketId)` | Claim proportional payout for winning side. |
| `scanResolvableMarkets(cursor, limit)` | Let agents discover expired markets ready for resolution. |
| `getAgentMarketContext(marketId)` | Return question, source, funding, status, and request IDs for agents. |
| `getResolutionFundingStatus()` | Return required deposit, contract balance, and top-up needed. |
| `agentManifest()` | On-chain description of the autonomous resolver interface. |

Somnia constants:

| Constant | Value |
|---|---|
| Agent Platform | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| LLM Parse Website Agent | `12875401142070969085` |
| LLM Inference Agent | `12847293847561029384` |
| Chain | Somnia Shannon Testnet |
| Chain ID | `50312` |
| RPC | `https://dream-rpc.somnia.network` |

## Proof Artifacts

Latest v4 deployment:

- Contract: [0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC](https://shannon-explorer.somnia.network/address/0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC)
- Deploy tx: [0x792bdd…5326](https://shannon-explorer.somnia.network/tx/0x792bdda72326da570994761b1c71f4455582e44a90b06403c8bb094cb0df5326)
- Prefund tx: [0x0eda0e…9a33](https://shannon-explorer.somnia.network/tx/0x0eda0e2b9751b77c2df06712d75fcea3b2b30a90904d71fb3e6f46b814af9a33) — 1 STT
- Seed market #1 tx: [0x8e372a…55a1](https://shannon-explorer.somnia.network/tx/0x8e372acfdbe82e73c603e555304146d6d5a5d1a24dfef976197b2cc5d4e355a1)
- Seed market #2 tx: [0xc02856…a42c](https://shannon-explorer.somnia.network/tx/0xc028568b047a686786ce33c0140c1a292b45e722e418a629cb4d2a887443a42c)
- Hardening vs. v3: custom errors, `nonReentrant` guard on `bet` / `claimWinnings` / both agent callbacks, `.call{value:}` with success check
- Test coverage: 36/36 Foundry tests pass locally (was 16/16 in v3)

Completed historical E2E resolution:

- Market: `Is the capital of France Paris?`
- Parse agent receipt: [2400421](https://agents.testnet.somnia.network/receipts/2400421)
- Inference agent receipt: [2400485](https://agents.testnet.somnia.network/receipts/2400485)
- Outcome: `YES`
- Claim tx: [0x888327...2380](https://shannon-explorer.somnia.network/tx/0x8883273b0bb83dbb7f2cb489b7a5b54b9a7591afeaee58bd472e7fb5b57c2380)

## Demo Flow

1. Open [the proof page](https://autoresolve-somnia.vercel.app/proof).
2. Show the **Live Autonomous Resolver Console**.
3. Point out `scanResolvableMarkets`, `getAgentMarketContext`, funding status, and resolvable seeded markets.
4. Open the completed parse and inference receipts.
5. Open the main app, connect a wallet on Somnia Shannon, create or open a market, place a bet, and request resolution after the 5-minute market window ends.
6. Show the resolution timeline and claim flow.

If live agent execution takes longer than the pitch slot, use the historical proof receipts `2400421` and `2400485`.

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
NEXT_PUBLIC_CONTRACT_ADDRESS=0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC
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

- Market creation validation.
- Betting and proportional payouts.
- Winner cannot claim twice.
- Missing market guards.
- Resolution top-up accounting.
- Parse/inference callback success and failure.
- Unauthorized callback rejection.
- Invalid LLM output reopening the market.
- Agent discovery and context scanning.

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

Open the deployed contract in Shannon Explorer:

- Contract: [`0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC`](https://shannon-explorer.somnia.network/address/0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC)
- The "Contract" tab will show the verified source code (see the verification step in `DEPLOYED.md`).
- The "Transactions" tab will show the deploy tx, the 1 STT prefund, and the two seeded market creations.

### Step 3 — The agents actually ran

Open the two completed agent receipts. Each one is a real Somnia validator-executed agent run with a public, inspectable output:

- **Parse agent** (extracts the answer from the source URL): [receipt `2400421`](https://agents.testnet.somnia.network/receipts/2400421)
- **Inference agent** (classifies the answer as `YES` or `NO`): [receipt `2400485`](https://agents.testnet.somnia.network/receipts/2400485)

Inside the same app:

- Open [`/receipt/2400421`](https://autoresolve-somnia.vercel.app/receipt/2400421) for the parser receipt.
- Open [`/receipt/2400485`](https://autoresolve-somnia.vercel.app/receipt/2400485) for the inference receipt.

You will see the validator subcommittee (3 nodes), each validator's individual output, the consensus result, and the agent's raw API response. The receipt pages in the app normalize the raw payload into a timeline.

### Step 4 — The on-chain settlement matches the agent output

The receipt `2400485` says the inference agents returned `YES` for the question "Is the capital of France Paris?". Follow the receipt to the claim transaction:

- Claim tx: [`0x8883273b0bb83dbb7f2cb489b7a5b54b9a7591afeaee58bd472e7fb5b57c2380`](https://shannon-explorer.somnia.network/tx/0x8883273b0bb83dbb7f2cb489b7a5b54b9a7591afeaee58bd472e7fb5b57c2380)

Open it in Shannon Explorer. The transaction input is a call to `claimWinnings`; the log shows the payout. The agent's answer (`YES`) became the contract's stored outcome; the contract's stored outcome became the payout. The chain of custody is complete.

### Step 5 — The tests pass

The contract is fully covered by Foundry tests. From the repo root:

```bash
forge test -vv
```

You should see all tests green, including parse-callback success, parse-callback failure, inference-callback success, inference-callback failure, unauthorized callback rejection, payout math, double-claim prevention, agent context scanning, and reentrancy.

### Step 6 — The contract exposes an agent-discoverable interface

External autonomous resolvers do not need the frontend. The contract itself answers:

```bash
cast call 0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC "scanResolvableMarkets(uint256,uint256)" 0 10 \
  --rpc-url https://dream-rpc.somnia.network

cast call 0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC "getAgentMarketContext(uint256)" 1 \
  --rpc-url https://dream-rpc.somnia.network

cast call 0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC "agentManifest()" \
  --rpc-url https://dream-rpc.somnia.network
```

The same answers power the `Agent Command Center` widget on the live `/proof` page. A second agent — written by anyone — can drive the same resolution flow without the UI.

## Known limitations

AutoResolve is a hackathon build. To stay focused on the agent-callback primitive, the current implementation intentionally leaves the following for post-deadline work. None of these affect the demo path.

- **Binary markets only.** The contract supports `YES` / `NO`. Multi-outcome markets require richer storage.
- **No dispute window.** Once an inference callback writes a result, it is final. A future version will add a time-bounded dispute path backed by staked challengers.
- **No fee model.** Winners currently receive the full proportional payout. A protocol fee + treasury is straightforward to add.
- **Source quality is user-supplied.** The contract does not enforce an allowlist of source domains. A future version can constrain sources or require a creator bond.
- **Failed agent resolution reverts to retry, not dispute.** If parse or inference fails, the market returns to `Open` and a new `requestResolution` call can retry.

## License

MIT
