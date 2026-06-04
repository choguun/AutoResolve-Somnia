# CLAUDE.md

AutoResolve — autonomous prediction markets on Somnia Shannon Testnet, resolved by
validator-executed Somnia Agents (LLM Parse Website → LLM Inference).

This file is the entry point for any coding agent working in this repo. Read it before
touching code; the contracts and frontend have a small number of moving parts and a few
hard constraints that are easy to break.

## Project overview

- **One-line pitch**: YES/NO prediction markets where the oracle is a Somnia agent
  pipeline that writes the outcome back on-chain and unlocks payouts.
- **Hackathon**: Built for the Somnia Agentathon. The repo is a single demo product
  with a hardening pass (v4 contract). Future multi-outcome markets, dispute windows,
  and protocol fees are intentionally out of scope (see `README.md` → Known limitations).
- **Current deployed contract (v13)**:
  `0x37822751E5ab0688344135797ee8FFCFa76443fB` on Somnia Shannon Testnet
  (chain id `50312`, RPC `https://dream-rpc.somnia.network`).
- **Live app**: `autoresolve-somnia.vercel.app`. Proof page at `/proof`, agent manifest
  at `/api/agent-manifest` and `/.well-known/autoresolve-agent.json`.
- **Historical E2E proof**: market #1 on the v2 contract resolved `YES` via parse
  receipt `2400421` and inference receipt `2400485`; winnings claimed on-chain
  (`claimTx: 0x888327…2380`). The v13 deployment is the current live target.
- **v7 E2E AI-created→AI-resolved proof**: market #3 on v7
  (`0xd3E946aC…4B69`) was created by the inference agent and resolved YES via
  parse receipt `4254170` and inference receipt `4254291` (tx
  `0x362daa6f…b5143`). v13 inherits the same prompt + pipeline; the address
  changed because v13 added the
  stuck-generation recovery path (forceResetGeneration +
  scanStuckGenerationRequests + GenerationReset event +
  lastGenerationRequestId high-water mark — symmetric to the v11
  stuck-resolution recovery but for the creation pipeline) + the
  agent output length cap (MAX_AGENT_OUTPUT_LENGTH = 1024 bytes on
  parse + inference results, with over-long treated as graceful
  ResolutionFailed rather than a revert) + the relayer GenerationFailed
  advisory log step (operators can see creation failure rate without
  auto-retry, since wrong topic is the proposer's call to fix) on top
  of the v12 hardening (MarketReset.stuckRequestId field + useAgentReceipt
  recovery-flag reset + receipt-proxy 502 cache removed) and the v11
  hardening (stuck-request recovery path: forceResetMarket +
  scanStuckMarkets + STALE_REQUEST_TIMEOUT / relayer getLogs chunking /
  useAgentReceipt refetch-on-error gate / attemptCount clear-on-success /
  404 cache on the receipt proxy) and the v10 hardening
  (inference-callback Pending/None guard / honest rollback stage / fresh
  manifest / receipt polling timeout / client-side URL validation /
  relayer dedup fix + retry cap + per-tick topUp re-read) and the v9
  hardening (stuck-market balance check / exact YES/NO parsing /
  case-insensitive URL validation / paginated relayer) and the v8
  hardening (MIN_BET / URL validation / nonReentrant / return `requestId` /
  inner-revert decoder).
  STALE_REQUEST_TIMEOUT / relayer getLogs chunking / useAgentReceipt
  refetch-on-error gate / attemptCount clear-on-success / 404 cache on
  the receipt proxy) and the v10 hardening
  (inference-callback Pending/None guard / honest rollback stage / fresh
  manifest / receipt polling timeout / client-side URL validation /
  relayer dedup fix + retry cap + per-tick topUp re-read) and the v9
  hardening (stuck-market balance check / exact YES/NO parsing /
  case-insensitive URL validation / paginated relayer) and the v8
  hardening (MIN_BET / URL validation / nonReentrant / return `requestId` /
  inner-revert decoder).

## Repo layout

```
src/                              Solidity sources (Foundry `src`)
  AutonomousPredictionMarket.sol  Main market + resolver contract
  AgentSmokeTest.sol              Throwaway inference-only smoke test
  interfaces/
    IAgentRequester.sol           Somnia Agent Platform interface (createRequest, getRequestDeposit, Response/Request/ResponseStatus)
    ILLMAgents.sol                LLM Parse Website + LLM Inference agent payload shapes

test/                             Foundry tests (`forge test -vv`)
  AutonomousPredictionMarket.t.sol 63 unit + fuzz + reentrancy tests with a mocked platform

script/                           Forge deploy scripts (`forge script …`)
  Deploy.s.sol                    Deploys market, prefunds 0.5 STT, seeds 2 demo markets
  AgentSmokeTest.s.sol            Deploys the smoke test caller

scripts/                          Shell + Node scripts (run with bash / node)
  deploy.sh                       Deploy via `forge create`, prefund 1 STT, seed markets, write NEXT_PUBLIC_CONTRACT_ADDRESS to .env, verify on explorer
  export-abi.mjs                  Copies `out/AutonomousPredictionMarket.json` ABI → `lib-web/abi.json` (runs automatically as `postinstall`)
  e2e-onchain.sh                  Cast-based end-to-end demo (prefund, create, bet, wait 5 min, requestResolution)
  seed-mock-markets.sh            Seeds four extra demo markets + small bets via cast

app/                              Next.js App Router
  page.tsx                        Home: tabbed market list (Active / Resolved / My Bets)
  create/page.tsx                 Create-market form
  market/[id]/page.tsx            Market detail: bet, resolution panel, payout claim
  proof/page.tsx                  Judge-facing proof pack with AgentCommandCenter
  receipt/[requestId]/page.tsx    Validator receipt viewer + resolution timeline
  api/agent-manifest/route.ts     Machine-readable agent manifest (JSON)
  api/receipt/[requestId]/route.ts Server-side proxy + normalizer for Somnia agent receipts
  .well-known/autoresolve-agent.json/route.ts  Well-known discovery endpoint

components/                       UI components (grouped by feature)
  layout/        Header, Footer
  markets/       MarketCard, CreateMarketForm
  market/        MarketHeader, BetPanel, ResolutionPanel, PayoutClaim
  proof/         AgentCommandCenter (live scan/context/funding calls)
  receipts/      AgentReceiptViewer, ResolutionTimeline
  shared/        Providers (wagmi/RainbowKit/QueryClient), Tooltip, CopyButton, EmptyState, Skeleton, TransactionStatus

hooks/                            React Query data hooks
  useMarkets.ts                   nextMarketId, getMarket, infinite market list (paged 9 at a time), marketBets, user positions
  useResolutionStatus.ts          Derives canResolve/isResolving/isResolved from a market
  useAgentReceipt.ts              Polls `/api/receipt/[id]` until complete
  useRpcHealth.ts                 Polls block number; ok / slow / down classification

lib-web/                          Frontend-agnostic chain + contract glue
  contract.ts                     CONTRACT_ADDRESS, CONTRACT_ABI, Market/Bet types, formatting helpers
  somnia.ts                       Somnia testnet chain definition + wagmi/rainbowkit config
  agents.ts                       Somnia agent IDs, receipt URLs, receipt normalization (Validator subcommittee, steps, consensus)
  agentManifest.ts                Builds the JSON manifest served at /api/agent-manifest and /.well-known/autoresolve-agent.json
  transactionToast.ts             Sonner helpers that deep-link to the Shannon explorer
  abi.json                        Generated by `pnpm export-abi` (do not hand-edit)

lib/forge-std/                    Forge standard library (vendored — keep tracked)

scripts/relayer.mjs                Always-on auto-retry relayer (watches ResolutionFailed + GenerationFailed + open markets, re-calls requestResolution; force-resets stuck markets and stuck generation requests)

plan.md, PITCH_DECK.md, DEMO.md, DEPLOYED.md, README.md
                                  Long-form context. README is the canonical public spec; DEPLOYED.md tracks addresses and tx hashes.
```

## Somnia chain + agent constants (do not change)

These values are part of the on-chain contract and the live deployment. Editing them
silently will desync the contract, the frontend, and the seed scripts.

| Constant | Value | Where used |
|---|---|---|
| Chain id | `50312` | `lib-web/somnia.ts`, `foundry.toml` (rpc endpoint name `shannon`) |
| Chain name | `Somnia Shannon Testnet` | wagmi config, manifest, UI |
| Native symbol | `STT` | UI formatting, manifest |
| RPC | `https://dream-rpc.somnia.network` | wagmi transport, public client fallback, e2e scripts |
| Explorer | `https://shannon-explorer.somnia.network` | receipt/address/tx links |
| Agent Platform | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` | Hardcoded in contract as `PLATFORM` |
| LLM Parse Website agent id | `12875401142070969085` | `LLM_PARSE_WEBSITE_AGENT_ID` (contract + lib-web) |
| LLM Inference agent id | `12847293847561029384` | `LLM_INFERENCE_AGENT_ID` (contract + lib-web) |
| Agent receipts base | `https://agents.testnet.somnia.network` (UI) / `https://receipts.testnet.agents.somnia.host` (raw) | `lib-web/agents.ts` |
| Hardcoded block-explorer | `https://shannon-explorer.somnia.network` | `lib-web/agents.ts` |

If any of these change, update the Solidity constant **and** `lib-web/agents.ts` /
`lib-web/somnia.ts` / `lib-web/agentManifest.ts` in the same commit, and redeploy.

## Solidity contract — what to know

File: `src/AutonomousPredictionMarket.sol` (single contract, ~485 lines).

### State + lifecycle

- `nextMarketId` starts at `1`. `marketExists(id)` = `id in [1, nextMarketId)` and
  the question string is non-empty.
- `MarketStatus`: `Open` → `Resolving` → `Resolved`. Reverting from `Resolving` to
  `Open` is the only valid backward edge (agent failure path).
- `MIN_DURATION = 300` seconds. Questions ≤ 500 chars, sources ≤ 300 chars.
- Bets update `yesTotal` / `noTotal` and per-user tallies
  (`userYesBets[user][id]`, `userNoBets[user][id]`). Winners are paid out
  proportionally: `payout = userWinningBets * totalPool / winningPool`.

### Resolution pipeline (the important part)

`requestResolution(marketId)` is the only entry point that triggers the agents:

1. Requires the market to be `Open`, `endTime` passed, and `parseRequestId == 0`.
2. Pulls the **required** deposit from `getResolutionFundingStatus()` (= parse
   deposit + inference deposit) and reverts `InsufficientContractBalance` if the
   contract's own balance is too low. Any `msg.value` over the **top-up needed**
   is refunded via `.call{value:}` (success check required — reverts
   `TransferFailed`).
3. Creates a request to the **Parse Website** agent via `PLATFORM.createRequest`
   with a payload that calls `IParseWebsiteAgent.ExtractString` against
   `market.resolutionSource`, then stores the request id in
   `requestToMarket` and `requestStage = ParseWebsite`.
4. Status flips to `Resolving`. The contract now waits for the platform callback.

Two callbacks complete the loop:

- `handleAgentResponse(...)` (parse callback): only callable by the platform.
  Pending/None reverts `StillPending`. Success → calls `_resolveWithLLMInference`,
  which encodes a second `ILLMInferenceAgent.inferString` payload constrained to
  `["YES", "NO"]`, then creates the inference request and stores it under
  `requestStage = Inference`. Failure → reverts market to `Open`, clears
  `parseRequestId`, emits `ResolutionFailed`.
- `handleInferenceCallback(...)`: success with a `YES`/`NO` first byte sets
  `market.outcome`, `status = Resolved`, `resolvedAt`, and emits
  `MarketResolved`. Anything that doesn't start with `Y`/`y`/`N`/`n` reopens the
  market (`InvalidInferenceOutput` path).

All agent callbacks use `nonReentrant`. The funding math and the
`requestToMarket`/`requestStage` cleanup are load-bearing — don't move them.

### Agent-discoverable surface (used by `/proof` and external resolvers)

- `agentManifest()` returns a one-string description of the interface.
- `scanResolvableMarkets(cursor, limit)` paginates markets that
  `canResolveMarket` (status `Open`, endTime passed, never requested).
- `scanStuckMarkets(cursor, limit)` paginates markets in `Resolving` whose
  parse or inference request is older than `STALE_REQUEST_TIMEOUT` (30 min).
- `scanStuckGenerationRequests(cursor, limit)` paginates stuck generation
  requests (older than `STALE_REQUEST_TIMEOUT`); walks
  `[cursor, lastGenerationRequestId]` with a tight upper bound.
- `scanAgentCreatedMarkets(cursor, limit)` paginates markets whose
  `creator == AGENT_CREATOR_SENTINEL` (`0x0000…A1`).
- `getAgentMarketContext(marketId)` returns question, source, status, end time,
  pool, request ids, and live funding requirements.
- `getResolutionFundingStatus()` returns `(requiredDeposit, contractBalance, topUpNeeded)`.
- `getGenerationFundingStatus()` returns the inference deposit and top-up needed
  for `requestMarketGeneration`.

`MAX_AGENT_SCAN_LIMIT = 50`; all `scan*` functions revert `InvalidLimit` on 0 or oversize.

### Stuck-request recovery (the v11+ pattern, applied symmetrically in v13)

- `forceResetMarket(marketId)` reverts a stuck market (parse or inference
  request older than `STALE_REQUEST_TIMEOUT`) back to `Open` and emits
  `MarketReset(marketId, resetBy, stage, stuckRequestId)`. The
  `stuckRequestId` field is non-indexed and matches the in-flight parse or
  inference request id, so a relayer that scans for resets learns which
  platform request to drop from local retry bookkeeping. Reverts
  `NotStuck` if the market is fresh or already cleared.
- `forceResetGeneration(requestId)` is the symmetric v13 path for the
  creation pipeline: reverts a stuck generation request, clears the four
  state mappings (`requestStage`, `requestToTopic`, `generationProposer`,
  `generationRequestedAt`), and emits `GenerationReset(requestId, resetBy)`.
  The inference deposit was forwarded to the platform at request time and
  is not refundable. Reverts `GenerationNotStuck` if fresh or cleared.

### Output cap (v13)

- `MAX_AGENT_OUTPUT_LENGTH = 1024` bytes caps the agent's parse and
  inference result strings. Over-long responses are treated as a graceful
  parse/inference failure — the market reopens and `ResolutionFailed` is
  emitted. **The contract never reverts in callbacks**: a revert would
  leave the market stuck in `Resolving` until `STALE_REQUEST_TIMEOUT`.

### Security

- Custom errors throughout (cheaper + indexable than revert strings).
- `nonReentrant` on `bet`, `claimWinnings`, both agent callbacks, and both
  `forceReset*` functions.
- `TransferFailed` custom error on all `.call{value:}` paths.
- The deposit math in `requestResolution` is test-covered for partial top-up,
  no-top-up, and over-funding. Don't rewrite it without re-running the
  `testRequestResolution*` suite.
- The platform address is hardcoded; an unauthorized callback reverts
  `OnlyPlatform`. There is no admin key, no multisig, no upgrade path.

## Frontend — what to know

- **Next.js 15 App Router + React 19 + TypeScript strict + Tailwind.** `pnpm` is the
  package manager (version pinned via `packageManager`).
- **Web3**: wagmi v2, viem, RainbowKit. Only `somniaTestnet` is in the chain list.
  `lib-web/somnia.ts` exports `config = getDefaultConfig({ ssr: true })` and is
  wrapped by `components/shared/Providers.tsx`.
- **Data fetching**: TanStack Query. Polling intervals are baked into the hooks
  (`useMarket` 5s, `useMarkets` 10s, `useResolutionDeposit` 30s,
  `useAgentReceipt` 5s until complete). Don't add ad-hoc `setInterval`s.
- **ABI flow**: `forge build` → `scripts/export-abi.mjs` copies the contract ABI
  from `out/` into `lib-web/abi.json`. This runs as `postinstall` and is also
  invoked at the end of `scripts/deploy.sh`. The frontend imports
  `CONTRACT_ABI` from `lib-web/abi.json`.
- **Contract address**: `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env` (or
  `0x0000…0000` placeholder when unset). `scripts/deploy.sh` writes this back
  into `.env` after a successful deploy.
- **RPC health**: `useRpcHealth` runs in the background, classifies ok/slow/down
  based on advancing block number and 1.5s latency.
- **Receipts**: `app/api/receipt/[requestId]/route.ts` proxies Somnia's
  `https://receipts.testnet.agents.somnia.host` and runs
  `normalizeMinimalReceipt` so the UI can show validator subcommittee, steps,
  and result without re-implementing normalization in every component.

### Styling conventions

- Dark glass-morphism look: `bg-white/5 backdrop-blur-xl` on panels, gradient
  borders, gradient text on hero numbers. See `app/page.tsx` and
  `app/proof/page.tsx` for the canonical examples.
- Brand palette: violet `#8b5cf6` and cyan `#06b6d4` (exposed as
  `somnia.purple` / `somnia.cyan` in `tailwind.config.ts`).
- Sonner toasts (`components/shared/Providers.tsx`) are themed dark with
  cyan glow; tx toasts deep-link to the Shannon explorer.
- The Outfit Google font is loaded via `next/font` in `app/layout.tsx`. Don't
  switch to a different display font without also updating the hero text shadow
  / gradient expectations.

## Local dev

```bash
# 1. Install JS deps (postinstall runs export-abi.mjs)
pnpm install

# 2. Configure env
cp .env.example .env
# Fill in: PRIVATE_KEY, NEXT_PUBLIC_CONTRACT_ADDRESS (or run scripts/deploy.sh first),
#          NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID (optional but recommended),
#          ETHERSCAN_API_KEY (optional, for verification)

# 3. Build contracts + export ABI for the frontend
forge build
pnpm export-abi    # idempotent if `forge build` already produced the artifact

# 4. Run the app
pnpm dev           # http://localhost:3000
```

Notes:

- `pnpm export-abi` is **required** after any contract change. Without it,
  `lib-web/abi.json` is stale and the frontend will call the wrong selectors.
- `pnpm postinstall` calls `export-abi.mjs` with `|| true`, so a fresh clone
  without `forge build` will warn but not fail.
- The frontend talks to `https://dream-rpc.somnia.network` by default. To
  point at a local node, override the transport in `lib-web/somnia.ts` and
  the fallback client in `hooks/useMarkets.ts`.

## Test / lint / build

```bash
# Solidity (Foundry)
forge build                       # compile
forge test -vv                    # 79 tests in test/AutonomousPredictionMarket.t.sol

# Frontend
pnpm lint                         # eslint --max-warnings=0
pnpm build                        # next build (used by Vercel)
```

The Foundry tests use `MockAgentPlatform` etched at the platform address via
`vm.etch`, and a `MarketHarness` that lets tests force-resolve markets and
seed user bet totals. There's a `ReentrantClaimer` for the
`nonReentrant` test. Keep the platform mock compatible with the real
`IAgentRequester` interface (it is — both have
`createRequest(uint256,address,bytes4,bytes)` returning `uint256` and
`getRequestDeposit()` returning `uint256`).

## Deploying

```bash
./scripts/deploy.sh
# Equivalent manual flow:
#   forge build
#   forge create src/AutonomousPredictionMarket.sol:AutonomousPredictionMarket \
#     --rpc-url "$SHANNON_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast --legacy
#   cast send <contract> --value 1ether --rpc-url … --private-key … --legacy
#   cast send <contract> "createMarket(string,string,uint256)" "<q>" "<url>" 300 --rpc-url … --private-key … --legacy
```

`scripts/deploy.sh` will:

1. Run `forge build`.
2. Deploy via `forge create` (broadcast + legacy tx).
3. Prefund the contract with `1 STT` (this covers the 0.66 STT total deposit for
   parse + inference, and the small refund slippage).
4. Seed two 5-minute demo markets: "Is the capital of France Paris?" and "Did
   Bitcoin exist before 2010?".
5. Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env` to the new address.
6. Run `pnpm export-abi` so the local `lib-web/abi.json` matches.
7. Optionally run `forge verify-contract` against Shannon Explorer if
   `ETHERSCAN_API_KEY` is set.

`scripts/seed-mock-markets.sh` adds four more markets (with small bets) for
demos. `scripts/e2e-onchain.sh` is a Cast-based end-to-end walk that waits 5
minutes for the market to expire before requesting resolution.

Frontend deploy:

```bash
pnpm exec vercel deploy --prod
# vercel.json pins framework=nextjs and the build/install commands.
```

## Environment variables

From `.env.example`:

| Variable | Required for | Notes |
|---|---|---|
| `PRIVATE_KEY` | Deploy, e2e, seed scripts | Deployer wallet; needs STT for gas + prefund. Never commit `.env`. |
| `SHANNON_RPC_URL` | Optional | Defaults to `https://dream-rpc.somnia.network`. |
| `ETHERSCAN_API_KEY` | Optional | Enables source verification in `deploy.sh`. |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Frontend | The contract address the UI binds to. Set by `deploy.sh`. |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | Frontend | RainbowKit needs a real project id for mobile wallets to work. A 32-zero fallback is allowed for local-only desktop testing. |

## Common gotchas

- **ABI drift**: If you change a function signature in
  `AutonomousPredictionMarket.sol` and forget `pnpm export-abi`, the frontend
  will call the wrong selector and wagmi will throw at runtime.
- **Hardcoded platform address**:
  `AutonomousPredictionMarket.PLATFORM` is a `constant`. On a chain where
  `0x037B…6776` is not the Agent Platform, calls will revert with empty
  results.
- **`requestResolution` funding math**: it refunds any `msg.value` beyond
  `topUpNeeded` (which can be `0` if the contract is already pre-funded). Don't
  assume a full deposit is forwarded to the platform on every call.
- **Markets expire in 5 minutes by default** (`MIN_DURATION = 300`). The seed
  scripts and demo markets use that minimum. Bumping it requires changing
  `MIN_DURATION` and re-seeding.
- **Failed agent resolution reopens the market**. There is no automatic retry;
  a second `requestResolution` call is required.
- **Reentrancy**: only `bet`, `claimWinnings`, and the two agent callbacks are
  guarded. Don't move ETH through new code paths without
  `nonReentrant`.
- **No dispute window**: once an inference callback writes the outcome, it is
  final. This is documented as a known limitation.
- **`.well-known/autoresolve-agent.json` is a route under `app/`, not a static
  file.** The folder name has a dot prefix; Next.js App Router still serves
  it because the directory contains a `route.ts`.
- **Cache files**: `cache/` and `out/` are gitignored but `lib/forge-std/` is
  not. Don't `git clean` the lib directory.

## Working conventions

- Match the existing v4 hardening style: custom errors, `nonReentrant` on
  payable entry points, `.call{value:}` with success check.
- When adding a new agent callback, also add it to the `RequestStage` enum and
  to the `requestStage` / `requestToMarket` cleanup paths in the existing
  callbacks.
- When adding a new agent-discoverable method, add a corresponding entry in
  `lib-web/agentManifest.ts` so `/api/agent-manifest` and
  `/.well-known/autoresolve-agent.json` stay in sync.
- When updating the README, also update the matching addresses/tx hashes in
  `DEPLOYED.md`. The README claims to be independently verifiable; numbers
  must match.
- Tests are in `test/AutonomousPredictionMarket.t.sol`. New code paths should
  come with at least one happy-path + one revert-path test. Fuzz tests use
  `forge-std`'s `bound` and are appreciated for math-heavy logic (payouts,
  durations, length limits).
