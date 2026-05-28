# AutoResolve

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
| Current contract | [0xE81F...682c](https://shannon-explorer.somnia.network/address/0xE81F6D33057a9872efdFC881e031b325F13d682c) |
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

## Contract

Current deployment:

```text
AutonomousPredictionMarket v3
0xE81F6D33057a9872efdFC881e031b325F13d682c
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

Latest v3 deployment:

- Contract: [0xE81F6D33057a9872efdFC881e031b325F13d682c](https://shannon-explorer.somnia.network/address/0xE81F6D33057a9872efdFC881e031b325F13d682c)
- Deploy tx: [0x8f676f...f2eb](https://shannon-explorer.somnia.network/tx/0x8f676f7a2329f07bd9fad007b6ab84d2695537e8a31ee94c790a6ab238f2f2eb)
- Prefund tx: [0x189ee8...ee4f](https://shannon-explorer.somnia.network/tx/0x189ee830c51f95eb77f8870580b326f05d6cf252a99c95b59ba8e9ebe17bee4f)
- Seed market #1 tx: [0x374109...9f85](https://shannon-explorer.somnia.network/tx/0x374109bfb7e99ae20905d5fb992eedb70909d1d413b0f5ecedc16c9367d69f85)
- Seed market #2 tx: [0x3cf5eb...95f9](https://shannon-explorer.somnia.network/tx/0x3cf5ebed5fb7060c57e28d80e9fd79a8c65e6f3b849c56394be6899b245e95f9)

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
NEXT_PUBLIC_CONTRACT_ADDRESS=0xE81F6D33057a9872efdFC881e031b325F13d682c
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

## License

MIT
