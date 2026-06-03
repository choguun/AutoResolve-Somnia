# Deployed Addresses (Somnia Shannon)

| Contract | Address | Explorer |
|---|---|---|
| **AutonomousPredictionMarket (v8 — current, MIN_BET + URL validation + nonReentrant + relayer + return requestId)** | `0x53C5A4c83DC646e7c94168da04A08524C1D6249E` | [View](https://shannon-explorer.somnia.network/address/0x53C5A4c83DC646e7c94168da04A08524C1D6249E) |
| AutonomousPredictionMarket (v7 — SPECIFIC-URL prompt + end-to-end proof) | `0xd3E946aC5aDfCd7772778ce841886BF933b04B69` | [View](https://shannon-explorer.somnia.network/address/0xd3E946aC5aDfCd7772778ce841886BF933b04B69) |
| AutonomousPredictionMarket (v6 — short-duration prompt, still picked homepages) | `0xCEC6b358eA408fA29F0D29119cF91F800dc81Ab1` *(reused; same v5 bytecode with v6 prompt)* | [View](https://shannon-explorer.somnia.network/address/0xCEC6b358eA408fA29F0D29119cF91F800dc81Ab1) |
| AutonomousPredictionMarket (v5 — fully autonomous creation) | `0xCEC6b358eA408fA29F0D29119cF91F800dc81Ab1` | [View](https://shannon-explorer.somnia.network/address/0xCEC6b358eA408fA29F0D29119cF91F800dc81Ab1) |
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

## Latest deployment (v8 — full hardening + relayer) — completed

v8 is the current live contract. Changes vs. v7 are all defense-in-depth and observability upgrades that keep the prompt/bytecode-shape the same:

| Step | Detail |
|---|---|
| **Contract** | `0x53C5A4c83DC646e7c94168da04A08524C1D6249E` |
| **Deployer** | `0x119F9fd07C09B7AD45Ac45c6797e2c2FB97a5fD6` |
| **Contract balance** | `2.0 STT` |
| **`nextMarketId`** | `3` (markets 1 & 2 seeded) |
| **`AGENT_CREATOR_SENTINEL`** | `0x00000000000000000000000000000000000000A1` |
| **Test coverage** | 58/58 Foundry tests (was 50/50 on v7) |
| **New surface** | `MIN_BET = 0.001 ether`, `InvalidSourceUrl` / `BetBelowMinimum` reverts, `nonReentrant` on `requestResolution` and `requestMarketGeneration`, `requestResolution` returns the parse `requestId`, `handleGenerationCallback` decodes the inner createMarket revert selector and emits a descriptive name (`QuestionTooLong`, `SourceTooLong`, `InvalidSourceUrl`, `DurationTooShort`) instead of the opaque `create-reverted` |
| **New infra** | `scripts/relayer.mjs` — off-chain auto-retry relayer that watches `ResolutionFailed` events + any open markets past `endTime` and re-calls `requestResolution` (closes the last "human in the loop" gap) |

### Why v8

The v7 contract closed the AI-created → AI-resolved loop with a SPECIFIC-URL prompt. v8 closes the remaining autonomous gaps:

- **MIN_BET** prevents accidental zero-value bets that would inflate `userYesBets`/`userNoBets` counters without moving `yesTotal`/`noTotal`.
- **`InvalidSourceUrl`** rejects `javascript:`, `ftp:`, and bare hostnames at the contract boundary so the parse agent never wastes a request on a URL it can't scrape.
- **`nonReentrant`** on `requestResolution` and `requestMarketGeneration` matches the callback guards and prevents any future ETH-moving code path from being abused.
- **Returning `requestId` from `requestResolution`** lets the UI deep-link the user to the live parse receipt immediately after the tx confirms.
- **Inner-revert decoder** in `handleGenerationCallback` makes agent creation failures self-describing.
- **`scripts/relayer.mjs`** is the always-on relayer that re-fires resolution whenever an agent callback fails — turns "fully autonomous" from a one-shot demo into a recoverable loop.

## Latest deployment (v7 — SPECIFIC-URL prompt + end-to-end proof) — historical

v7 was the first contract where the same agent that created a market also provided the source URL, and the same two-stage resolver closed it. The change vs. v5/v6 is **prompt-only** — same bytecode-shape contract, but the agent prompt now requires the source URL to be a SPECIFIC article/page (not a site homepage) so the parse agent can succeed.

| Step | Detail |
|---|---|
| **Contract** | `0xd3E946aC5aDfCd7772778ce841886BF933b04B69` |
| **Deployer** | `0x119F9fd07C09B7AD45Ac45c6797e2c2FB97a5fD6` |
| **Contract balance** | `2.2 STT` |
| **`nextMarketId`** | `4` (markets 1 & 2 seeded, market 3 AI-created) |
| **`AGENT_CREATOR_SENTINEL`** | `0x00000000000000000000000000000000000000A1` |
| **Prompt** | `Design a binary YES/NO prediction market on this topic. {topic} You MUST call createMarket(question, source, durationSeconds) exactly once. question <= 200 chars. The source URL MUST be a SPECIFIC article or page that directly states the answer to the YES/NO question (e.g. https://en.wikipedia.org/wiki/Paris NOT https://en.wikipedia.org/). Prefer a SHORT duration in [300, 600] seconds so the market can resolve quickly.` |
| **Test coverage** | 52/52 Foundry tests pass locally (36 v4 baseline + 16 v5/v7 creation-pipeline tests) |

### Why v6 → v7

v5 and v6 both let the agent pick generic homepages (e.g. `https://en.wikipedia.org/`,
`https://bitcoin.org/`) as the source. The parse agent then returns HTTP 422 because
homepages don't have an extractable `outcome` JSON field. v7's prompt explicitly
requires a SPECIFIC article (with a worked example) and narrows the duration range
to `[300, 600]` so the demo loop stays under 10 minutes. This unblocks the full
end-to-end AI-created → AI-resolved path.

### End-to-end proof on v7 (market #3)

The current v7 contract ran a complete AI-created → AI-resolved loop on a
single market. The agent that created the market also provided the source URL,
and the same two-stage resolver closed it.

| Field | Value |
|---|---|
| **Market id** | 3 |
| **Question** | `Is the capital of France Paris?` |
| **Source** | `https://en.wikipedia.org/wiki/Paris` (chosen by the LLM agent) |
| **`creator`** | `0x0000…A1` (the `AGENT_CREATOR_SENTINEL`) |
| **Bets** | 0.01 STT YES + 0.005 STT NO (pool 0.015 STT) |
| **Parse request id** | `4254170` — [receipt explorer](https://agents.testnet.somnia.network/receipts/4254170) |
| **Parse agent output** | extracted `outcome = "Yes"` |
| **Inference request id** | `4254291` — [receipt explorer](https://agents.testnet.somnia.network/receipts/4254291) |
| **Inference agent output** | final classification `YES` |
| **Resolution requested (parse) tx** | [`0xc8457e94…1c31c`](https://shannon-explorer.somnia.network/tx/0xc8457e941883f0bbc3108ac0206575e80c42bb0666515c24262517ff8ae1c31c) |
| **Resolution requested (inference) tx** | [`0x0b30f326…392ce`](https://shannon-explorer.somnia.network/tx/0x0b30f326d06a85ac6422bab93a7cfe8616b47356987799768b3afb5a0cc392ce) |
| **Market resolved tx** | [`0x362daa6f…b5143`](https://shannon-explorer.somnia.network/tx/0x362daa6f16fd4b84b1d832867dcb679225a0f1364d58dda2ccd36234000b5143) (block 399354730) |
| **Outcome** | `YES` (resolved at ts 0x6a1febab) |
| **Winnings claimable** | `claimWinnings(3)` for the 0.01 STT YES bettor — pays 0.015 STT (full pool, since YES won 100%) |

Validator subcommittee for the v7 resolution calls (3-node consensus via
`receiptServiceUrl`): `0x55Ac…2A33` and 2 others (per receipt `agentRunnerAddress`).

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

## On-chain state (current v8)

- v8 Market **#1**: "Is the capital of France Paris?" — seeded, 5-min demo (Wikipedia source, `creator = 0x119F…5fD6`)
- v8 Market **#2**: "Did Bitcoin exist before 2010?" — seeded, 5-min demo (Wikipedia source, `creator = 0x119F…5fD6`)
- v8 Contract balance: `2.0 STT`
- v8 `nextMarketId`: `3`
- v8 `AGENT_CREATOR_SENTINEL`: `0x00000000000000000000000000000000000000A1`
- v8 `MIN_BET`: `0.001 ether` (reverts `BetBelowMinimum` for smaller bets)
- v8 `createMarket` requires `http://` or `https://` source URLs (reverts `InvalidSourceUrl` otherwise)

## On-chain state (v7 — historical, fully autonomous proof)

- v7 Market **#1**: "Is the capital of France Paris?" — seeded, 5-min demo (Wikipedia source, `creator = 0x119F…5fD6`)
- v7 Market **#2**: "Did Bitcoin exist before 2010?" — seeded, 5-min demo (Wikipedia source, `creator = 0x119F…5fD6`)
- v7 Market **#3**: "Is the capital of France Paris?" — **AI-created**, **resolved `YES`**, `creator = 0x0000…A1` (Wikipedia article URL chosen by the agent)
- v7 Contract balance: `2.2 STT`
- v7 `nextMarketId`: `4`
- v7 `AGENT_CREATOR_SENTINEL`: `0x00000000000000000000000000000000000000A1`

## On-chain state (v5 — historical AI-creation demo)

- v5 Market **#1**: "Is the capital of France Paris?" — seeded (Wikipedia source)
- v5 Market **#2**: "Did Bitcoin exist before 2010?" — seeded (Wikipedia source)
- v5 Market **#3**: "Will Somnia mainnet launch before 2027?" — **AI-created** (somnia.io — homepage; would fail parse)
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
- `NEXT_PUBLIC_CONTRACT_ADDRESS=0x53C5A4c83DC646e7c94168da04A08524C1D6249E`

## Auto-retry relayer

`scripts/relayer.mjs` is an always-on watchdog that turns "fully autonomous" from a
one-shot demo into a recoverable loop. It watches the contract for
`ResolutionFailed` events and any open markets past `endTime` without a parse
request, then re-submits `requestResolution` with the wallet's top-up.

```bash
PRIVATE_KEY=0x... \
  NEXT_PUBLIC_CONTRACT_ADDRESS=0x53C5A4c83DC646e7c94168da04A08524C1D6249E \
  node scripts/relayer.mjs
```

Optional env:
- `SHANNON_RPC_URL` (default `https://dream-rpc.somnia.network`)
- `RELAYER_POLL_MS` (default 30 seconds)
- `RELAYER_MAX_BET_GAS` (default 1 STT — refuses to top up markets needing more)
