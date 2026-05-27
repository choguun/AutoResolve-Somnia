# AutoResolve Demo Guide

## Pre-Demo Setup (5 minutes)

1. Copy `.env.example` → `.env` and fill in credentials
2. Deploy contract: `./scripts/deploy.sh`
3. Set `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env`
4. Start frontend: `pnpm dev`
5. Connect MetaMask to **Somnia Shannon Testnet** (Chain ID 50312)
6. Ensure wallet has STT ([faucet](https://testnet.somnia.network/))

## Live Demo Flow (3 minutes)

### 1. Market List (30s)
- Show pre-seeded Wikipedia demo markets
- Point out status badges, pool sizes, countdown timers

### 2. Create Market (30s)
- Question: "Is water composed of hydrogen and oxygen?"
- Source: `https://en.wikipedia.org/wiki/Water`
- Duration: **5 min (demo)**
- Show the agent resolution preview

### 3. Place Bets (30s)
- Open a market with existing pool
- Bet **0.01 STT YES** from wallet A
- Bet **0.01 STT NO** from wallet B (or same wallet for demo)

### 4. Trigger Resolution (60s)
- Wait for market to end (or use pre-expired demo market)
- Click **Request Resolution**
- Show cost breakdown (Parse + Inference deposits)
- Watch **Resolution Pipeline** timeline update:
  - Stage 1: Web Scrape (pending → receipt link)
  - Stage 2: Classification (pending → receipt link)
  - Market Resolved

### 5. Receipt Deep Dive (30s)
- Open `/receipt/[requestId]` page
- Show validator consensus nodes
- Show agent payload and result
- Link to [agents.somnia.network](https://agents.somnia.network)

### 6. Claim Winnings (15s)
- Show **Claim Winnings** button for winning side
- Confirm STT received

## Pitch Talking Points

- **"No humans, no disputes"** — deterministic LLM + validator consensus
- **"Fully on-chain AI"** — agents invoked from the smart contract, not external APIs
- **"Verifiable by anyone"** — public execution receipts on Somnia
- **"Built on Somnia Agentic L1"** — same infrastructure as Prophecy Social

## Troubleshooting

| Issue | Fix |
|---|---|
| `Insufficient deposit` | Send more STT; resolution costs ~0.63 STT (2 stages) |
| Agent scrape fails | Market reverts to Open; retry or use Wikipedia sources |
| Receipt not loading | Wait 30–60s; poll every 5s; check agents.somnia.network directly |
| Wrong network | Switch MetaMask to Shannon (50312) |

## Recording Tips

- Use 1920×1080, dark mode browser
- Zoom to 125% for readability
- Pre-create a 5-min market 4 minutes before recording
- Have a second browser/wallet ready for opposing bets
