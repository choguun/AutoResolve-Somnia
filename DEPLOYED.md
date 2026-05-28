# Deployed Addresses (Somnia Shannon)

| Contract | Address | Explorer |
|---|---|---|
| **AutonomousPredictionMarket (v3 — agent-discoverable)** | `0xE81F6D33057a9872efdFC881e031b325F13d682c` | [View](https://shannon-explorer.somnia.network/address/0xE81F6D33057a9872efdFC881e031b325F13d682c) |
| **AutonomousPredictionMarket (v2)** | `0x1631303A748076648a0AbbE077a657Ad7812834F` | [View](https://shannon-explorer.somnia.network/address/0x1631303A748076648a0AbbE077a657Ad7812834F) |
| AgentSmokeTest | `0x6e1dfB44AEc5c52dE3b12753726ea57207862F65` | [View](https://shannon-explorer.somnia.network/address/0x6e1dfB44AEc5c52dE3b12753726ea57207862F65) |

## Latest deployment (v3) — completed

| Step | Detail |
|---|---|
| **Deploy tx** | [0x8f676f…f2eb](https://shannon-explorer.somnia.network/tx/0x8f676f7a2329f07bd9fad007b6ab84d2695537e8a31ee94c790a6ab238f2f2eb) |
| **Prefund tx** | [0x189ee8…ee4f](https://shannon-explorer.somnia.network/tx/0x189ee830c51f95eb77f8870580b326f05d6cf252a99c95b59ba8e9ebe17bee4f) — 1 STT |
| **Seed market #1 tx** | [0x374109…9f85](https://shannon-explorer.somnia.network/tx/0x374109bfb7e99ae20905d5fb992eedb70909d1d413b0f5ecedc16c9367d69f85) |
| **Seed market #2 tx** | [0x3cf5eb…95f9](https://shannon-explorer.somnia.network/tx/0x3cf5ebed5fb7060c57e28d80e9fd79a8c65e6f3b849c56394be6899b245e95f9) |
| **nextMarketId** | `3` |
| **Contract balance** | `1.0 STT` |
| **Resolution deposit** | `0.66 STT` |
| **Agent-discovery functions** | `agentManifest`, `scanResolvableMarkets`, `getAgentMarketContext`, `getResolutionFundingStatus` |

## Full E2E resolution (Market #1) — completed

| Step | Detail |
|---|---|
| **Question** | Is the capital of France Paris? |
| **Source** | https://en.wikipedia.org/wiki/Paris |
| **Bets** | 0.02 STT YES + 0.01 STT NO (pool 0.03 STT) |
| **Resolution tx** | [0xea838a…08a1](https://shannon-explorer.somnia.network/tx/0xea838a9943616a19443c0a7e7a42674ba3792fc84ba38d4be77679099f5a08a1) — paid from contract pool (`--value 0`) |
| **Parse agent request** | `2400421` — [receipt explorer](https://agents.testnet.somnia.network/receipts/2400421) |
| **Inference agent request** | `2400485` — [receipt explorer](https://agents.testnet.somnia.network/receipts/2400485) |
| **Outcome** | **YES** (resolved at block 393276027) |
| **Resolved tx** | [0x349fb0…4035](https://shannon-explorer.somnia.network/tx/0x349fb03fa6262befb581347a979fb5fa2706d48df5d818daec749f624fe54035) |
| **Claim tx** | [0x888327…2380](https://shannon-explorer.somnia.network/tx/0x8883273b0bb83dbb7f2cb489b7a5b54b9a7591afeaee58bd472e7fb5b57c2380) — 0.03 STT winnings to YES bettor |

## On-chain state

- v3 Market **#1**: "Is the capital of France Paris?" — seeded, 5-minute demo market
- v3 Market **#2**: "Did Bitcoin exist before 2010?" — seeded, 5-minute demo market
- v3 Contract balance: `1.0 STT`
- v2 Market **#1**: Resolved YES, retained as completed E2E proof with public agent receipts

## Frontend

```bash
pnpm dev   # http://localhost:3000
```

Set in `.env`:
- `NEXT_PUBLIC_CONTRACT_ADDRESS=0xE81F6D33057a9872efdFC881e031b325F13d682c`
