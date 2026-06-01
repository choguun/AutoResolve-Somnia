# Deployed Addresses (Somnia Shannon)

| Contract | Address | Explorer |
|---|---|---|
| **AutonomousPredictionMarket (v4 — current, hardened)** | `0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC` | [View](https://shannon-explorer.somnia.network/address/0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC) |
| AutonomousPredictionMarket (v3 — agent-discoverable) | `0xE81F6D33057a9872efdFC881e031b325F13d682c` | [View](https://shannon-explorer.somnia.network/address/0xE81F6D33057a9872efdFC881e031b325F13d682c) |
| AutonomousPredictionMarket (v2) | `0x1631303A748076648a0AbbE077a657Ad7812834F` | [View](https://shannon-explorer.somnia.network/address/0x1631303A748076648a0AbbE077a657Ad7812834F) |
| AgentSmokeTest | `0x6e1dfB44AEc5c52dE3b12753726ea57207862F65` | [View](https://shannon-explorer.somnia.network/address/0x6e1dfB44AEc5c52dE3b12753726ea57207862F65) |

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
