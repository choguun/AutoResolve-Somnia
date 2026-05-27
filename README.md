# AutoResolve

**The first fully on-chain, agent-powered prediction market that resolves itself using Somnia's native LLM agents. No humans. No disputes. Fully verifiable.**

AutoResolve lets anyone create YES/NO prediction markets. After a market ends, a two-stage Somnia agent pipeline autonomously resolves the outcome:

1. **LLM Parse Website** — scrapes the resolution source and extracts evidence
2. **LLM Inference (Qwen3-30B)** — classifies the result as YES or NO with constrained output

Every step produces a public execution receipt on [agents.somnia.network](https://agents.somnia.network) with validator consensus.

## Architecture

```
Frontend (Next.js + wagmi)
        ↓
AutonomousPredictionMarket.sol
        ↓ createRequest()
Somnia Agent Platform (Shannon testnet)
        ↓
Validator subcommittee → byte-identical consensus → callback
```

## Tech Stack

| Layer | Technology |
|---|---|
| Contracts | Foundry, Solidity 0.8.24 |
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Web3 | wagmi v2, viem, RainbowKit |
| Chain | Somnia Shannon Testnet (50312) |

## Quick Start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js 18+
- STT on [Somnia Shannon testnet](https://testnet.somnia.network/)
- [WalletConnect Cloud](https://cloud.walletconnect.com/) project ID

### 1. Install

```bash
git clone https://github.com/choguun/AutoResolve-Somnia.git
cd AutoResolve-Somnia
pnpm install
forge build
pnpm export-abi
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
PRIVATE_KEY=your_deployer_private_key
SHANNON_RPC_URL=https://dream-rpc.somnia.network
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_CONTRACT_ADDRESS=   # filled after deploy
```

### 3. Deploy Contract

```bash
./scripts/deploy.sh
```

Copy the logged address into `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env`.

### 4. Run Frontend

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), connect wallet to **Somnia Shannon Testnet**, and interact.

## Contract

**AutonomousPredictionMarket** — core functions:

| Function | Description |
|---|---|
| `createMarket(question, source, duration)` | Create a YES/NO market (min 5 min duration) |
| `bet(marketId, option)` | Place a bet with STT |
| `requestResolution(marketId)` | Trigger 2-stage agent resolution (payable) |
| `claimWinnings(marketId)` | Winners claim proportional payout |

### Somnia Integration (verified)

| Constant | Value |
|---|---|
| Platform | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| LLM Parse Website Agent | `12875401142070969085` |
| LLM Inference Agent | `12847293847561029384` |
| Shannon RPC | `https://dream-rpc.somnia.network` |
| Chain ID | `50312` |

## Demo Markets (seeded on deploy)

| Question | Source | Expected |
|---|---|---|
| Is the capital of France Paris? | wikipedia.org/wiki/Paris | YES |
| Did Bitcoin exist before 2010? | wikipedia.org/wiki/Bitcoin | NO |

Use **5-minute duration** markets for live pitch demos.

## Development

```bash
# Contract tests
pnpm test:contracts

# Export ABI after contract changes
pnpm export-abi

# Agent smoke test (optional — verifies inferString on Shannon)
forge script script/AgentSmokeTest.s.sol \
  --rpc-url $SHANNON_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast --legacy

# Production build
pnpm build
```

## 5-Minute Pitch Script

1. **Problem** — Prediction markets depend on human oracles (latency, disputes, trust gaps)
2. **Solution** — AutoResolve uses Somnia's native LLM agents for autonomous, consensus-verified resolution
3. **Live demo** — Create market → bet YES/NO → trigger resolution → watch agent pipeline
4. **Receipt deep dive** — Open `/receipt/[requestId]` — show validator byte-identical outputs
5. **Architecture** — Two-stage pipeline, deterministic LLMs, fully on-chain

## Demo Video Checklist

Record a 2–3 minute walkthrough covering:

- [ ] Wallet connect on Shannon testnet
- [ ] Market list with demo markets
- [ ] Place YES and NO bets
- [ ] Trigger resolution after market ends
- [ ] Resolution timeline (Stage 1 → Stage 2 → Resolved)
- [ ] Agent receipt viewer with validator consensus
- [ ] Claim winnings

## Deploy Frontend (Vercel)

1. Push repo to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Set environment variables:
   - `NEXT_PUBLIC_CONTRACT_ADDRESS`
   - `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`
4. Deploy

## License

MIT
