# Deployed Addresses (Somnia Shannon)

| Contract | Address | Explorer |
|---|---|---|
| **AutonomousPredictionMarket (v5 — current, fully autonomous creation)** | `0xCEC6b358eA408fA29F0D29119cF91F800dc81Ab1` | [View](https://shannon-explorer.somnia.network/address/0xCEC6b358eA408fA29F0D29119cF91F800dc81Ab1) |
| AutonomousPredictionMarket (v4 — hardened, resolution only) | `0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC` | [View](https://shannon-explorer.somnia.network/address/0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC) |
| AutonomousPredictionMarket (v3 — agent-discoverable) | `0xE81F6D33057a9872efdFC881e031b325F13d682c` | [View](https://shannon-explorer.somnia.network/address/0xE81F6D33057a9872efdFC881e031b325F13d682c) |
| AutonomousPredictionMarket (v2) | `0x1631303A748076648a0AbbE077a657Ad7812834F` | [View](https://shannon-explorer.somnia.network/address/0x1631303A748076648a0AbbE077a657Ad7812834F) |
| AgentSmokeTest | `0x6e1dfB44AEc5c52dE3b12753726ea57207862F65` | [View](https://shannon-explorer.somnia.network/address/0x6e1dfB44AEc5c52dE3b12753726ea57207862F65) |

## Latest deployment (v5 — fully autonomous) — completed

v5 adds an on-chain market-creation pipeline. Any address can call
`requestMarketGeneration(topic)` with the inference deposit; the Somnia
LLM Inference agent (`inferToolsChat` on agent id `12847293847561029384`)
yields a `createMarket(question, source, duration)` calldata back to the
contract. New markets are minted with `creator = 0x0000…A1` (sentinel)
and surface in the UI with the **"Created by AI"** badge.

| Step | Detail |
|---|---|
| **Contract** | `0xCEC6b358eA408fA29F0D29119cF91F800dc81Ab1` |
| **Deployer** | `0x119F9fd07C09B7AD45Ac45c6797e2c2FB97a5fD6` |
| **Pre-fund** | 1.0 STT (covers 3 generation requests at 0.33 STT each) |
| **Seed markets** | #1 (Paris, 5 min), #2 (Bitcoin, 5 min) |
| **Inference deposit** | 0.33 STT per generation |
| **Test coverage** | 52/52 Foundry tests (36 v4 baseline + 16 new for the creation pipeline) |
| **New surface** | `requestMarketGeneration(string)`, `getGenerationFundingStatus()`, `scanAgentCreatedMarkets(cursor,limit)`, `handleGenerationCallback`, `AGENT_CREATOR_SENTINEL = 0x…A1` |

### E2E AI creation demo (5 topics → 5 markets)

Run with `./scripts/auto-generate.sh scripts/topics.txt` against the deployed contract. All 5 markets landed on-chain with `creator = 0x…A1`.

| # | Topic | Market id | Tx | Inference request | Receipt |
|---|---|---|---|---|---|
| 1 | Will Somnia mainnet launch before 2027? | 3 | [0xaa11eefa…](https://shannon-explorer.somnia.network/tx/0xaa11eefa0cc84157504381489f1d13f87ffba86e8f66834e4db4061e5ea492cc) | `4204120` | [view](https://agents.testnet.somnia.network/receipts/4204120) |
| 2 | Did Bitcoin reach 100,000 USD on any exchange in 2024? | 4 | [0xaa8a907e…](https://shannon-explorer.somnia.network/tx/0xaa8a907ec9e604682bd5ae57868caa799ff6db6dacce0a9f1588fe87cf309de8) | `4204139` | [view](https://agents.testnet.somnia.network/receipts/4204139) |
| 3 | Did the United States default on its debt in 2025? | 5 | [0x59db17a0…](https://shannon-explorer.somnia.network/tx/0x59db17a0cc1d5d33b30afbfa8813d30aed39404c5953754b0c3d140c7d18dba6) | `4204164` | [view](https://agents.testnet.somnia.network/receipts/4204164) |
| 4 | Will Ethereum trade above 5,000 USD on any major exchange in 2026? | 7 | [0xd832333d…](https://shannon-explorer.somnia.network/tx/0xd832333d6dda4ea9881e6444f86771ac446c72f0fc04b521e4a6fcdeed1d66a9) | `4204186` | [view](https://agents.testnet.somnia.network/receipts/4204186) |
| 5 | Is the capital of Australia Canberra? | 6 | [0x6a865de3…](https://shannon-explorer.somnia.network/tx/0x6a865de36eb7a17539cfc122df9fe9c017d7ab1b3b94aff69cc70b56365e6a2f) | `4204208` | [view](https://agents.testnet.somnia.network/receipts/4204208) |

Validator subcommittee for these calls (3-node consensus via
`receiptServiceUrl`): `0x05f1…3bDe`, `0x55Ac…2A33`, `0x1Cb3…4926`.

## Latest deployment (v4) — completed

| Step | Detail |
|---|---|
| **Deploy tx** | [0x792bdd…5326](https://shannon-explorer.somnia.network/tx/0x792bdda72326da570994761b1c71f4455582e44a90b06403c8bb094cb0df5326) (block 397515146) |
| **Prefund tx** | [0x0eda0e…9a33](https://shannon-explorer.somnia.network/tx/0x0eda0e2b9751b77c2df06712d75fcea3b2b30a90904d71fb3e6f46b814af9a33) — 1 STT (block 397515175) |
| **Seed market #1 tx** | [0x8e372a…55a1](https://shannon-explorer.somnia.network/tx/0x8e372acfdbe82e73c603e555304146d6d5a5d1a24dfef976197b2cc5d4e355a1) (block 397515212) |
| **Seed market #2 tx** | [0xc02856…a42c](https://shannon-explorer.somnia.network/tx/0xc028568b047a686786ce33c0140c1a292b45e722e418a629cb4d2a887443a42c) (block 397515248) |
| **Deployer** | `0x119F9fd07C09B7AD45Ac45c6797e2c2FB97a5fD6` |
| **nextMarketId** | `3` |
| **Contract balance** | `1.0 STT` |
| **Resolution deposit** | `0.66 STT` (parse `0.33` + inference `0.33`) |
| **Top-up needed** | `0` (fully funded) |
| **Hardening vs. v3** | Custom errors (cheaper, indexable), `nonReentrant` guard on `bet` / `claimWinnings` / both agent callbacks, `.call{value:}` with success check instead of `.transfer()` |
| **Test coverage** | 36/36 Foundry tests pass locally (was 16/16 in v3): 4 fuzz tests, reentrancy test, receive test, `agentManifest` smoke, full `requestResolution` revert matrix |

## Full E2E resolution (Market #1 on v2) — historical proof

This proof is from the v2 contract and remains valid as the canonical end-to-end demo of the two-stage agent pipeline. Receipts are public and inspectable.

| Step | Detail |
|---|---|
| **Question** | Is the capital of France Paris? |
| **Source** | https://en.wikipedia.org/wiki/Paris |
| **Bets** | 0.02 STT YES + 0.01 STT NO (pool 0.03 STT) |
| **Resolution tx** | [0xea838a…08a1](https://shannon-explorer.somnia.network/tx/0xea838a9943616a19443c0a7e7a42674ba3792fc84ba38d4be77679099f5a08a1) |
| **Parse agent request** | `2400421` — [receipt explorer](https://agents.testnet.somnia.network/receipts/2400421) |
| **Inference agent request** | `2400485` — [receipt explorer](https://agents.testnet.somnia.network/receipts/2400485) |
| **Outcome** | **YES** (resolved at block 393276027) |
| **Resolved tx** | [0x349fb0…4035](https://shannon-explorer.somnia.network/tx/0x349fb03fa6262befb581347a979fb5fa2706d48df5d818daec749f624fe54035) |
| **Claim tx** | [0x888327…2380](https://shannon-explorer.somnia.network/tx/0x8883273b0bb83dbb7f2cb489b7a5b54b9a7591afeaee58bd472e7fb5b57c2380) — 0.03 STT winnings to YES bettor |

## On-chain state (current v5)

- v5 Market **#1**: "Is the capital of France Paris?" — seeded (Wikipedia source)
- v5 Market **#2**: "Did Bitcoin exist before 2010?" — seeded (Wikipedia source)
- v5 Market **#3**: "Will Somnia mainnet launch before 2027?" — **AI-created** (somnia.io)
- v5 Market **#4**: "Did Bitcoin reach 100,000 USD on any exchange in 2024?" — **AI-created** (coindesk.com)
- v5 Market **#5**: "Did the United States default on its debt in 2025?" — **AI-created** (reuters.com)
- v5 Market **#6**: "Is the capital of Australia Canberra?" — **AI-created** (australia.gov.au)
- v5 Market **#7**: "Will Ethereum trade above 5,000 USD on any major exchange in 2026?" — **AI-created** (coingecko.com)
- v5 Contract balance: `0.59 STT` (started 2.0 STT, 5×0.33 STT consumed by inference)
- v5 `nextMarketId`: `8`
- v5 `AGENT_CREATOR_SENTINEL`: `0x00000000000000000000000000000000000000A1`

## On-chain state (current v4)

- v4 Market **#1**: "Is the capital of France Paris?" — seeded, 5-minute demo market (Wikipedia source)
- v4 Market **#2**: "Did Bitcoin exist before 2010?" — seeded, 5-minute demo market (Wikipedia source)
- v4 Contract balance: `1.0 STT`
- v3 Market **#1**: "Is the capital of France Paris?" — seeded (overlapping v4 #1)
- v3 Market **#2**: "Did Bitcoin exist before 2010?" — seeded
- v2 Market **#1**: Resolved YES, retained as completed E2E proof with public agent receipts

## Source verification

The deploy script `scripts/deploy.sh` will run `forge verify-contract` automatically when `ETHERSCAN_API_KEY` is set in `.env`. To verify the current v4 contract retroactively:

```bash
forge verify-contract \
  --chain-id 50312 \
  --etherscan-api-key <YOUR_KEY> \
  0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC \
  src/AutonomousPredictionMarket.sol:AutonomousPredictionMarket
```

## Frontend

```bash
pnpm dev   # http://localhost:3000
```

Set in `.env`:
- `NEXT_PUBLIC_CONTRACT_ADDRESS=0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC`
