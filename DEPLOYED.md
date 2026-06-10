# Deployed Addresses (Somnia Shannon)

| Contract | Address | Explorer |
|---|---|---|
| **AutonomousPredictionMarket (v19+v40+v45 — current, 1 v18-audit HIGH + 5 MEDIUM + 2 LOW closed in v19; 7 new tests + `getUserMarkets(address)` view in v40; v45 on-chain `agentManifest()` string bump v19 → v40 to advertise the user-position-discovery surface)** | `0x48556EA096F4abFFB569916a138Ec946B54A85dE` | [View](https://shannon-explorer.somnia.network/address/0x48556EA096F4abFFB569916a138Ec946B54A85dE) |
| **Frontend + relayer (v64 — dApp surface for stranded-seed observability: `/api/stranded-seeds` API route derives the stranded set from on-chain data, and a new `StrandedSeedsCard` on `/proof` polls the endpoint and renders count + total STT locked + per-market detail. v64 also fixes a misleading 're-resolving market N' log line. v63 was the v62-audit cleanup; v62 was the relayer-driven auto-liquidity feature itself: when `RELAYER_LIQUIDITY_STT > 0` (default 0 = disabled for first-deploy safety), the relayer EOA places a YES+NO seed bet on every newly-created market and auto-claims the winnings on `MarketResolved`; the seed is invisible in the UI and uses the existing `bet()` / `claimWinnings()` entry points with no contract bytecode change. v61 was the bet-flow UX fix; v60 was the prompt-suffix `[duration=N]` change; v59 (H0) daily auto-create via `{{date}}` template; v60 (L0) `RESET_SUBMITTED_TOPICS=1` env var; v58 renamed home-page "Resolved" tab to "Ended"; v57 LiveCountdown; v56 Daily Resolution Demo on /proof). The v60 contract was redeployed at `0xc7d1A923A5a5C90d3134aAD2Abd508D192468f4f` (5 STT prefunded for ~5 days of daily auto-create).)** | n/a (frontend) | [Live app](https://autoresolve-somnia.vercel.app) |
| AutonomousPredictionMarket (v14 — 9 v13-audit gaps closed: NO-outcome parser, AgentMarketContext timestamps, DuplicateToolCall advisory, relayer reset attempt cap, receipt-kind branch, status passthrough, stuck-gen doc comment, manifest v14 bump, exact YES/NO manifest correction) | `0x598E4F830bc5F6542a9E39DA761c1a74F5fd66a9` | [View](https://shannon-explorer.somnia.network/address/0x598E4F830bc5F6542a9E39DA761c1a74F5fd66a9) |
| AutonomousPredictionMarket (v13 — 5 v12-audit gaps closed: stuck-generation recovery, agent output length cap, relayer GenerationFailed visibility + recovery, non-reverting callbacks on over-long output, `lastGenerationRequestId` high-water mark) | `0x37822751E5ab0688344135797ee8FFCFa76443fB` | [View](https://shannon-explorer.somnia.network/address/0x37822751E5ab0688344135797ee8FFCFa76443fB) |
| AutonomousPredictionMarket (v12 — 3 v11-audit gaps closed: `MarketReset.stuckRequestId`, `useAgentReceipt` recovery flag reset, 502 cache removed) | `0x4D590eF3688a6Aa4630A57082bC62e14ACc2F6c5` | [View](https://shannon-explorer.somnia.network/address/0x4D590eF3688a6Aa4630A57082bC62e14ACc2F6c5) |
| AutonomousPredictionMarket (v11 — 5 v10-audit gaps closed: stuck-request recovery, relayer getLogs chunking, refetch on error, attemptCount clear on success, 404 cache) | `0x58df0efc0cF6B1322e8d998257d750b18bb10ee7` | [View](https://shannon-explorer.somnia.network/address/0x58df0efc0cF6B1322e8d998257d750b18bb10ee7) |
| AutonomousPredictionMarket (v10 — 12 audit gaps closed: relayer dedup + retry cap + per-tick topUp read, inference Pending guard, honest rollback stage, fresh manifest, receipt polling timeout, client-side URL validation) | `0x6c94AA83e2C8D1d8f22B1E17537D8736E3d7fB65` | [View](https://shannon-explorer.somnia.network/address/0x6c94AA83e2C8D1d8f22B1E17537D8736E3d7fB65) |
| AutonomousPredictionMarket (v9 — last autonomy gaps closed: stuck-market balance check, exact YES/NO parse, original status on inner revert, case-insensitive URL scheme, paginated relayer) | `0x7D47a5eF4BE519D1B712C8609a100f27D6c4Eb7E` | [View](https://shannon-explorer.somnia.network/address/0x7D47a5eF4BE519D1B712C8609a100f27D6c4Eb7E) |
| AutonomousPredictionMarket (v8 — MIN_BET + URL validation + nonReentrant + relayer + return requestId) | `0x53C5A4c83DC646e7c94168da04A08524C1D6249E` | [View](https://shannon-explorer.somnia.network/address/0x53C5A4c83DC646e7c94168da04A08524C1D6249E) |
| AutonomousPredictionMarket (v7 — SPECIFIC-URL prompt + end-to-end proof) | `0xd3E946aC5aDfCd7772778ce841886BF933b04B69` | [View](https://shannon-explorer.somnia.network/address/0xd3E946aC5aDfCd7772778ce841886BF933b04B69) |
| AutonomousPredictionMarket (v6 — short-duration prompt, still picked homepages) | `0xCEC6b358eA408fA29F0D29119cF91F800dc81Ab1` *(reused; same v5 bytecode with v6 prompt)* | [View](https://shannon-explorer.somnia.network/address/0xCEC6b358eA408fA29F0D29119cF91F800dc81Ab1) |
| AutonomousPredictionMarket (v5 — fully autonomous creation) | `0xCEC6b358eA408fA29F0D29119cF91F800dc81Ab1` | [View](https://shannon-explorer.somnia.network/address/0xCEC6b358eA408fA29F0D29119cF91F800dc81Ab1) |
| AutonomousPredictionMarket (v4 — hardened, resolution only) | `0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC` | [View](https://shannon-explorer.somnia.network/address/0xE364Ab693000E0384dD8f69Cf0F4Fbce54248DFC) |
| AutonomousPredictionMarket (v3 — agent-discoverable) | `0xE81F6D33057a9872efdFC881e031b325F13d682c` | [View](https://shannon-explorer.somnia.network/address/0xE81F6D33057a9872efdFC881e031b325F13d682c) |
| AutonomousPredictionMarket (v2) | `0x1631303A748076648a0AbbE077a657Ad7812834F` | [View](https://shannon-explorer.somnia.network/address/0x1631303A748076648a0AbbE077a657Ad7812834F) |
| AgentSmokeTest | `0x6e1dfB44AEc5c52dE3b12753726ea57207862F65` | [View](https://shannon-explorer.somnia.network/address/0x6e1dfB44AEc5c52dE3b12753726ea57207862F65) |

> **Last deploy (v19 + v40 + v45, 2026-06-09):** `0x48556EA096F4abFFB569916a138Ec946B54A85dE` (deploy tx [`0x7b7fec…002f8`](https://shannon-explorer.somnia.network/tx/0x7b7fec571d19237307c4f52a2ef2339b4ed959703c6558b8b66a4fe282e002f8)). Prefunded 2 STT, seeded 2 demo markets (Paris + Bitcoin), relayer on Railway submitted AI-created market #3 ("Will Somnia mainnet launch before 2027?", tx `0x454a2c…e56c`) and pushed markets #1 + #2 to `Resolving` (parse txs `0x100efe…0f30` and `0x146f71…9ec7`). v46-v55 are frontend + relayer + tooling only (no new function selectors, no on-chain string change beyond v45). Total ABI change since v15: v40's `getUserMarkets` view + v19's `getGenerationPromptTemplate` view + 3 generation-pipeline functions + 2 v15-era `requestMarketGeneration` / `getGenerationFundingStatus` views; v45/v46/v47/v48/v49/v50/v51/v55 add zero new selectors (string content + relayer + frontend + tooling only).

## Latest deployment (v19+v40+v45 — 8 v18-audit gap closures + v40 O(K) My Bets view + v45 on-chain string bump) — completed 2026-06-09

The v19+v40+v45 contract is the current live deployment at
[`0x48556EA096F4abFFB569916a138Ec946B54A85dE`](https://shannon-explorer.somnia.network/address/0x48556EA096F4abFFB569916a138Ec946B54A85dE)
(deploy tx
[`0x7b7fec…002f8`](https://shannon-explorer.somnia.network/tx/0x7b7fec571d19237307c4f52a2ef2339b4ed959703c6558b8b66a4fe282e002f8)).
It closes the 8 v18-audit gap closures in v19 + adds v40's `getUserMarkets(address) → uint256[]` view + v45's on-chain `agentManifest()` string bump v19 → v40. The relayer (`scripts/relayer.mjs` v50) is running on Railway (project `autoresolve-somnia`, service `relayer`) and submitted the first AI-created market on this contract within seconds of boot. The full v8-v51 frontend + relayer + tooling changelog lives in the "Latest frontend (v51)" section below.

For the v15 → v19+v40+v45 diff (the per-cycle contract + relayer + frontend changes that landed in this single bytecode), see the [Latest deployment (v19+v40+v45)](#latest-deployment-v19v40v45--8-v18-audit-gap-closures--v40-ok-my-bets-view--v45-on-chain-string-bump--completed-2026-06-09) header above. The "Latest frontend (v51)" section below is now the shipped state, not the pending-deploy state.

## Previous deployment (v15 — 1 HIGH + 6 MEDIUM + 1 LOW audit gaps closed) — historical (the v15 address `0x764Dc…2022b` was the live parent for v8-v15 source changes, none of which were deployed to a fresh address; the v19+v40+v45 deploy landed at a fresh `0x48556E…85dE` address on 2026-06-09)

v15 was the live contract at `0x764Dc86246D242382c7619Fc715d0E3A64B2022b` until 2026-06-09. It closed the 8 issues surfaced by a fresh audit of the v14 deployment (1 HIGH + 6 MEDIUM + 1 LOW). The most important fix is **H1**: v14 left `parseRequestedAt` set to the original parse timestamp in all three `handleInferenceCallback` rollback paths (over-long output, invalid YES/NO, non-success status), which misled `getAgentMarketContext` readers — they saw an Open market with `parseRequestedAt != 0`, indistinguishable from a

**Contract (2 fixes)**
- **H1 — `handleInferenceCallback` clears `parseRequestedAt` in all three
  rollback paths.** Before v15, the over-long, invalid-YES/NO, and
  non-success branches reopened the market but left the parse timestamp
  dangling. After a v15 success path (a market that resolves cleanly), the
  invariant is: `status == Resolved ⇒ parseRequestedAt == 0 && inferenceRequestedAt == 0`.
  After a v15 rollback, the invariant is: `status == Open ⇒
  parseRequestedAt == 0 && inferenceRequestedAt == 0`. Previously
  `getAgentMarketContext` could see `parseRequestedAt == T1` for a market
  in `Open` status, which made the stuck-detection (v11+) harder to
  reason about externally. Backed by three regression tests:
  `testInferenceCallbackOverlongPathClearsParseRequestedAt`,
  `testInferenceCallbackInvalidOutputPathClearsParseRequestedAt`, and
  `testInferenceCallbackFailedStatusPathClearsParseRequestedAt`.
- **L1 — `getGenerationPromptTemplate()` getter returns
  `(string prefix, string suffix)`.** External agents can now read the
  exact prompt template the contract sends to the LLM Inference agent's
  `inferToolsChat` without decompiling the source. The two constants
  (`GENERATION_PROMPT_PREFIX` / `GENERATION_PROMPT_SUFFIX`) are also
  exposed as `external constant` for direct read. The manifest advertises
  the getter so agent builders can find it. Backed by
  `testGenerationPromptTemplateGetterReturnsContractConstants`.

**Relayer (4 fixes)**
- **M1 — SPOF header note.** Added a top-of-file doc comment that calls out
  the relayer as a single point of failure for the "fully autonomous"
  claim. Recommends running a second relayer with a second PRIVATE_KEY
  pointed at the same contract. The on-chain recovery surface
  (`forceResetMarket` / `forceResetGeneration`) is still callable by anyone,
  so a missing relayer only blocks auto-retry, not stuck-market recovery.
- **M2 — parse-failure URL LRU.** A market whose parse callback fails
  (`ResolutionFailed` with stage=1 = ParseWebsite) is now recorded in a
  per-URL LRU cache (`urlKey → expiresAtMs`, TTL 1h, max 256 entries).
  The relayer's `tryResolveMarket` reads the cache via
  `isUrlInParseFailureCache(url)` and skips re-submission for cached
  URLs — the same URL won't parse any better on the next attempt. The
  cache is populated by `drainResolutionFailureEvents` when a parse-stage
  failure is observed. URL keying normalizes scheme + host to lowercase
  (a `https://Example.com/` and `HTTPS://example.com/` map to the same
  entry) and uses a djb2 hash for the key (compact, fast).
- **M3 — exponential backoff on retries.** New `nextRetryAt: Map` gates
  same-instance retries: after a failed `requestResolution`, the relayer
  sets `nextRetryAt[key] = Date.now() + BASE_BACKOFF_MS * 2^attempts`
  (capped at 30 minutes). On a successful resolution the entry is
  cleared. Closes the silent retry-storm vector — without backoff, a
  transient RPC failure could trigger a `requestResolution` on every 30s
  tick for the full `MAX_ATTEMPTS_PER_MARKET` budget. New log line:
  `[relayer] starting (v15)`.
- **M7 — verbose gate.** The "submitted" and "confirmed" log lines in
  `tryResolveMarket` are now wrapped in `if (VERBOSE)`. The default log
  output is now just the [relayer] tick headers and the resolution /
  generation success / failure lines — the per-tx noise is opt-in. No
  behavior change for operators who set `VERBOSE=1`.

**Frontend (2 fixes)**
- **M4 — `AgentCommandCenter` recovery panel invalidates `['market', id]`
  on force-reset success.** Previously, force-resetting a stuck market
  refetched the recovery panel (good) but left any open `/market/[id]`
  tabs on stale data. v15 adds
  `queryClient.invalidateQueries({ queryKey: ['market', recoveredMarketId.toString()] })`
  inside the success callback, so a judge deep-link to the stuck market
  on another tab updates immediately after the reset confirms.
- **L1 (frontend mirror) — `lib-web/contract.ts` does NOT need a new field
  this cycle.** The v15 contract changes (`parseRequestedAt` cleanup +
  prompt template getter) are exposed through the existing
  `AgentMarketContext` and a new view method, so the TS type surface is
  unchanged. The recovery panel picks up the new getter through
  `CONTRACT_ABI` automatically.

**Receipt API (2 fixes)**
- **M5 — fallback host on 5xx.** `app/api/receipt/[requestId]/route.ts`
  now retries the `agent-receipts` query on the alternate host
  (`agents.testnet.somnia.network`) when the canonical
  (`receipts.testnet.agents.somnia.host`) returns 5xx. The two hosts run
  on different infra, so a single-host outage no longer breaks the
  receipt page. A successful fallback response includes
  `_source: 'fallback'` so the UI can mark the row as "served from
  alternate host" if needed. 4xx responses (stale link, 429 throttling)
  are not retried — the cause is client-side, not infra.
- **M6 — new `app/api/receipt/by-tx/[hash]/route.ts` endpoint.** The
  GenerateMarketForm previously couldn't navigate the user from a
  confirmed `requestMarketGeneration` tx to the matching receipt
  page (it only had the tx hash, not the platform's `requestId`). The
  new endpoint reads the tx receipt, filters logs by the AutoResolve
  contract address, and decodes the `ResolutionRequested` /
  `GenerationRequested` event topics to return the `requestId` (or
  requestIds, for batched txs). `primaryRequestId` and `primaryKind`
  are convenience fields for the typical single-call tx.
- **M-friend — `lib-web/somnia-chain.ts` split out.** The chain
  definition now lives in a server-safe `somnia-chain.ts` so route
  handlers can import `somniaTestnet` without dragging in
  `getDefaultConfig` (which is client-only and poisoned the server
  bundle). `lib-web/somnia.ts` re-exports the chain for backward
  compatibility with existing imports.

**On-chain surface summary** (additive only):
- `handleInferenceCallback` clears `parseRequestedAt` in all 3 rollback
  branches.
- New view: `getGenerationPromptTemplate() returns (string prefix, string suffix)`.
- Two new `external constant string`s: `GENERATION_PROMPT_PREFIX` /
  `GENERATION_PROMPT_SUFFIX` (read by the getter).
- `agentManifest()` body bumps to v15 — documents the parseRequestedAt
  rollback fix and the prompt-template getter.

**Test coverage:** 87/87 Foundry (was 82/82 on v14). Five new tests:
- `testInferenceCallbackOverlongPathClearsParseRequestedAt` — H1 regression.
- `testInferenceCallbackInvalidOutputPathClearsParseRequestedAt` — H1
  regression for the invalid-YES/NO branch.
- `testInferenceCallbackFailedStatusPathClearsParseRequestedAt` — H1
  regression for the non-success-status branch.
- `testGenerationPromptTemplateGetterReturnsContractConstants` — L1
  getter test.
- `testAgentManifestAdvertisesV15` — manifest v15 assertion set:
  `v15` string, `getGenerationPromptTemplate` mention, and the
  parseRequestedAt + inference-rollback mention.

The relayer changes (M1+M2+M3+M7), the receipt proxy changes (M5+M6),
and the recovery-panel query invalidation (M4) have no automated test
coverage — the repo has no JS test framework for the relayer (single-file
`node` script) and no Next.js test framework. They are defended by the
code change itself, the matching hook changes, and manual review.

## Latest frontend (v51 hardening — manifest endpoint v50) — shipped 2026-06-09 with the v19+v40+v45 contract

The frontend at `autoresolve-somnia.vercel.app` is on v50 (the v22-v50 audit
sequence — 30+ audit cycles, 29 shipped versions; v39 was skipped after v38
went straight to v40). The contract on-chain is now v19+v40+v45 (the v19+v40+v45 deploy at
`0x48556E…85dE` on 2026-06-09). v45 only changed the compiled
bytecode (the on-chain `agentManifest()` string content was bumped v19 → v40
to advertise the user-position-discovery surface); v46-v51 are frontend
+ relayer + tooling only.

This section is the v8-v50 changelog for the next deploy. The bytecode diff
vs the live v15 is additive (new storage slots + new public functions + new
events; the existing functions and the resolution/generation pipeline are
unchanged). After the next deploy, this section becomes the new "Latest
deployment" and the v15 section above moves to "Previous deployment".

**v40 contract (1 L0 + 7 new tests)**
- L0 — `getUserMarkets(address) → uint256[]` view. Adds the
  `userMarketIds[user] / _userMarketIndex[user][marketId]` storage pair
  (manual EnumerableSet pattern with the 0-sentinel convention, 1 SSTORE on
  first bet, O(1) check on re-bet). `bet()` calls `_addUserMarketIfAbsent`
  after the existing `userYesBets` / `userNoBets` writes. `claimWinnings`
  does NOT remove from the set — the array tracks "user has bet on this
  market at some point" and the frontend reads the zeroed amounts to
  distinguish active positions from history. The frontend's `useMyBets`
  hook (consolidated from the pre-v40 `useMyBetsMarkets` + `useMyBets` pair)
  calls `getUserMarkets` once then `Promise.all`s the per-market
  `(getMarket, userYesBets, userNoBets)` triple — O(K) where K = the user's
  position count, replacing the O(N) "load every market page and check"
  loop in `app/page.tsx`.

**v19 contract (8 audit gaps closed, no live deploy yet)**
- H1 — `handleInferenceCallback` hoists `marketParseResult` cleanup. The
  pre-v19 overlong + invalid + non-success paths returned before reaching
  the v16 M1 bottom-of-function delete, leaving a stale cache that misled
  the relayer's `retryInferenceFromCache` pre-check.
- H2 — `PayoutClaim` invalidates `useUserBets` on success (frontend-only
  change paired with this).
- H3 — `tryResetStuckMarket` clears `nextRetryAt` (frontend-only change
  paired with this).
- M1 — receipt proxy returns 502 with `upstreamStatus: 200` when
  `normalizeMinimalReceipt` throws, so the frontend can distinguish a
  malformed body from a platform 5xx.
- M2 — `AgentCommandCenter` surfaces the `parseResultCached` field from
  `AgentMarketContext` (frontend-only change paired with this).
- L1 — `ResolutionPanel` filters `ResolutionRequested` logs by event
  signature, not just `topics[1] === marketId` (frontend-only).
- L2 — `formatStt` / `formatCountdown` precision safety (v19 widened the
  `formatStt` exponential threshold to 1 STT; v22 reverted it to 0.001 STT
  because the 1-STT threshold regressed 0.3/0.66/0.01 STT amounts to
  scientific notation; v22 ships the 0.001-STT threshold).
- L3 — receipt proxy `Cache-Control: max-age=2` on 5xx (v26 tightened from
  10s).

**v18 contract (7 audit gaps closed)**
- H1 — relayer `tryRetryInferenceFromCache` pre-check uses
  `cached.length > 0` instead of `> 2` (the old threshold was wrong because
  viem decodes `string` return values as plain JS strings, not hex).
- H2 — `_describeCreateRevert` decodes `DurationTooLong()` (v16's
  `MAX_DURATION=86400` upper bound was the most likely real-world
  over-budget path).
- M1 — `handleAgentResponse` overlong-output branch clears
  `marketParseResult` (symmetric to v19 H1's inference-callback fix).
- M2 — dead `AgentOutputTooLong` error removed.
- M3 — `AgentReceiptViewer` surfaces `_source: 'fallback'` badge.
- M4 — manifest documents public `marketParseResult` getter.
- L2 — `CREATE_MARKET_SELECTOR` constant extracted in
  `lib-web/agents.ts`.

**v17 contract (6 audit gaps closed)**
- H1 — `requestResolution` clears `marketParseResult` up-front (prevents
  the stale-cache race where a fresh resolution after a parse failure
  would leave the OLD cache in place).
- H2 — receipt proxy uses `NEXT_PUBLIC_CONTRACT_ADDRESS` instead of
  hardcoded platform address.
- L1 — `AgentMarketContext.parseResultCached: bool` field added.
- L2 — receipt proxy M4 retry loop catches fetch network errors as 599.
- M1 — relayer per-instance parse-failure LRU file keyed by EOA.
- M2 — relayer pre-checks `marketParseResult` before `retryFromCache`.
- M3 — relayer `mkdirSync(state/)` on startup.

**v16 contract (8 audit gaps closed)**
- H1 — `deploy.sh` prefund 1 → 2 STT.
- H2 — `MAX_DURATION = 86400` upper bound.
- H3 — persistent parse-failure LRU + drop v15 `attemptCount>0` gate.
- M1 — `retryInferenceFromCache` + `marketParseResult` cache +
  `InferenceUnderfunded` event + relayer routing.
- M3 — `GenerateMarketForm` wires `/api/receipt/by-tx`.
- M4 — receipt proxy retries primary once on 5xx.
- L1 — `generationRequestedAt` cleanup invariant.
- L3 — `AgentReceiptViewer` keyed on requestId.

**Frontend-only v22-v40 (no contract change)**
- v22 — `formatStt` restores 0.001-STT exponential threshold (fixes v19 L2
  regression); `endTimeMs` helper consolidated.
- v23 — receipt `?kind=generation` query param threaded through
  `GenerateMarketForm` + `AgentCommandCenter` → `AgentReceiptViewer`;
  `/proof` "Live version" label reads from manifest; `useMyBets` triggers
  `fetchNextPage` on tab switch (later removed in v40).
- v24 — `extractGenerationToolCall` decodes `createMarket` calldata;
  `/proof` "Latest Agent-Discoverable Deployment" splits into
  Frontend/Contract pill badges; relayer `drainGenerationFailureEvents`
  decodes `(uint8 status, string reason)` data; `useGenerationFailures`
  hook + "Recent Generation Failures" card.
- v25 — manifest `version` v22 → v24; `MarketContextCard` renders
  `parseResultCached` as 5th `MiniMetric`; `useMyBetsMarkets` drops
  joined market ids from query key; relayer startup log v16 → v24;
  Refresh button disabled while refetching; My Bets tab shows claimable
  count chip; manifest route handlers merge live `getGenerationPromptTemplate()`.
- v26 — `lib-web/agentManifestServer.ts` wraps
  `getGenerationPromptTemplate()` in `unstable_cache` (5 min revalidate) +
  module-level `publicClient`; receipt proxy 404/502 cache `max-age=10` →
  `max-age=2`; `AgentCommandCenter` surfaces `useGenerationFailures`
  `isError` state.
- v27 — `useAgentReceipt` drops 5-min `MAX_POLL_MS` cap; new amber
  "this is taking longer than expected" banner.
- v28 — relayer `drainInferenceUnderfundedEvents` runs before
  `drainFailureEvents`; `requestResolution` cache cleanup moves AFTER
  `InsufficientContractBalance` check.
- v29 — relayer `drainTopicFeed` (the "last human in the loop" gap closer)
  reads `scripts/topics.txt` on every tick; `useMarketCreatedByRequestId`
  hook for the "View market #N" auto-redirect + receipt-viewer link.
- v30 — relayer hoists `TOPICS_FILE` / `SUBMITTED_TOPICS_FILE` /
  `TOPIC_FEED_MAX_PER_TICK` above the startup `console.log` group (the
  v29 startup crashed with a TDZ ReferenceError and the relayer never
  reached the main loop — v30's `pnpm relayer:smoke` closes the
  verification triangle); `drainTopicFeed` pre-flight/add order reversed.
- v31 — `drainTopicFeed` waits for `waitForTransactionReceipt` and only
  adds the topic to the persistent Set if `receipt.status === 'success'`.
- v32 — manifest `promptTemplate.system` → `userSuffix`; `drainTopicFeed`
  Set-add writes synchronously to disk; `waitForTransactionReceipt`
  gets a 60s `timeout`; proof page "live on-chain is v15" note;
  receipt-by-tx logs a warning when `NEXT_PUBLIC_CONTRACT_ADDRESS` is
  unset.
- v33 — relayer `logResolvedMarkets` uses module-level
  `seenResolvedMarkets` Set; `MarketCard` "View live receipt" link
  prefers `inferenceRequestId` over `parseRequestId`;
  `useMarketCreatedByRequestId` `SCAN_WINDOW_BLOCKS` 5000n → 50_000n;
  `forceResetMarket` / `forceResetGeneration` use a per-tx `(hash, kind,
  id)` Map; `seed-mock-markets.sh` `place_bet` validates amount suffix;
  `e2e-onchain.sh` drops redundant 0.5 STT prefund; `useAgentReceipt`
  branches on `err.status`: 404 keeps polling, 5xx stops polling.
- v34 — proof page shows the v7 E2E AI-created→AI-resolved proof run;
  `useRpcHealth` first tick returns `'pending'`, adds `'stuck'` state at
  2 consecutive same-block ticks; `AgentReceiptViewer` branches on
  `upstreamStatus === 200`; proof page now async server component
  reading `agentManifest()` view at SSR time (5-min `unstable_cache`) so
  `contractVersion` self-updates on every deploy.
- v35 — `useGenerationFailures` `SCAN_WINDOW_BLOCKS` 5000n → 50_000n
  (symmetric with `useMarketCreatedByRequestId`); `useAgentReceipt`
  `MAX_POLL_MS` → `LONG_RUNNING_HINT_MS` rename; `useAgentReceipt`
  `startedAt` moves from `useState` to `useRef` + `useEffect` keyed on
  `id`; `/api/topics` adds `Cache-Control: public, max-age=5`.
- v36 — relayer `urlKey` hashes the FULL normalized URL (v15 dropped the
  path via `split.slice(0,3)`); relayer cap-exceedance log uses
  conditional-ellipsis; `/api/receipt/by-tx/[hash]` surfaces
  `contractFilterApplied` boolean + one-time toast in
  `GenerateMarketForm`; `useAgentReceipt` caps 404 polling at
  `LONG_RUNNING_HINT_MS` + `hasGivenUpOn404` flag.
- v37 — relayer `logResolvedMarkets` decodes outcome from `log.data` not
  `log.topics[2]` (`MarketResolved` only has `marketId` indexed);
  `useMarkets` parallelizes 9 `getMarket` reads per page with
  `Promise.all` (1.8-4.5s → ~500ms).
- v38 — `ResolutionPanel` extracts `ResolutionRequested` `requestId` from
  `log.data` not `log.topics[2]`; `/api/receipt/by-tx/[hash]` had the
  same bug for the `ResolutionRequested` branch.
- v40 — `getUserMarkets(address) → uint256[]` (above). Closes the
  pre-existing `app/page.tsx:34` `TODO(v24)` and the O(N) tab-switch
  trigger in `useMyBetsMarkets`.
- v41 — README + DEPLOYED version-label drift cleanup (v18/v15/v40
  references collapsed to "v15 live, v19+v40 pending deploy on the v15
  address family"); surfaces `pnpm relayer:smoke` in the public Testing
  section and v40 `getUserMarkets(address)` in Core functions + Step 6
  cast calls; surfaces relayer `drainTopicFeed` + `scripts/auto-generate.sh`
  in Demo Flow. No contract/relayer/frontend code changes.
- v42 — proof-page copy asymmetry: the 4 `criteria` rows in
  `app/proof/page.tsx` now mention BOTH creation and resolution (the
  pre-v42 rows were resolution-only, silently dropping the headline
  capability); "Machine-Readable Agent Interface" section adds the 3
  creation methods (`getGenerationFundingStatus`, `requestMarketGeneration`,
  `scanAgentCreatedMarkets`) alongside the 3 resolution methods. No
  contract/relayer code changes.
- v43 — `PayoutClaim` now invalidates BOTH the per-market `userBets`
  query AND the `myBets` My Bets tab query (v19 H2 missed the second
  key); relayer `readInferenceTopUp` collapses the two-call local
  mirror (`getInferenceDeposit` + `getBalance` + local arithmetic) into
  a single `getGenerationFundingStatus` read returning `status[2]`. No
  contract change, no main-loop behavior change.
- v44 — `.env.example` adds a "# Relayer (optional — ...)" block listing
  the 9 env vars `scripts/relayer.mjs` reads (all commented out with
  sensible defaults); `package.json:14` `pnpm deploy` now runs
  `bash scripts/deploy.sh` (was the stale v10 `forge script` that
  prefunded only 0.5 STT and was missing .env write + pnpm export-abi
  + verify) + stale `script/Deploy.s.sol` deleted; new `Dockerfile`
  (Node 20 Alpine + corepack + pnpm install --prod --frozen-lockfile +
  /app/state volume) + new README "Relayer hosting" subsection.
- v45 — on-chain `agentManifest()` string bumped v19 → v40 (advertises
  the user-position-discovery surface; no new function selectors, but
  the compiled bytecode changes); `BetPanel` adds the same
  `queryClient.invalidateQueries` pattern (myBets / userBets / market)
  that v19 H2 + v43 L1 applied to PayoutClaim; relayer catch log
  unconditional `…` → conditional `${topic.length > 40 ? '…' : ''}`
  (matches v36 M0 sibling pattern); relayer startup banner v37 → v45 +
  smoke grep; `scripts/deploy.sh` prefund comment typo "~6 cycles" →
  "~3" (real math: 0.62 STT per cycle, 2 STT prefund ≈ 3.2 cycles);
  Dockerfile dead duplicate `COPY scripts/relayer.mjs` deleted; proof
  page regex `v(\d+)` → `v(\d+(?:\.\d+)?)` so future patch bumps like
  v40.1 don't fall through to the "detecting…" placeholder.
- v46 — `CreateMarketForm` adds `queryClient.invalidateQueries(['nextMarketId'])`
  + `['markets']` on success (mirrors v45 M2 BetPanel + v19 H2 / v43 L1
  PayoutClaim pattern) — pre-v46 the just-created market didn't appear
  on `/` for the full 10s `useMarkets` refetchInterval; `ResolutionPanel`
  adds `queryClient.invalidateQueries(['market', marketId.toString()])`
  on success (same v45 M2 pattern) — pre-v46 a confused user could
  double-click "Request Resolution" in the 5s stale window and burn a
  second STT top-up that reverts `MarketNotOpen`; `PITCH_DECK.md` drift
  cleanup: v2 contract address → v15 (both occurrences), v3 contract
  reference → v15/v19+v40+v45, test count 19 → 113.
- v47 — `scripts/deploy.sh:64` BSD-sed `sed -i ''` rewritten portable
  (`mktemp + sed + mv`) — would have broken a Linux judge container
  run silently (deploys but `.env` not updated, frontend binds to
  placeholder address); `AgentCommandCenter` adds per-tx `(id → hash)`
  Map for `requestResolution` + `requestMarketGeneration` (sibling
  `pendingInvoke` Map mirrors the v33 H3 `pendingReset` pattern) — pre-
  v47 a judge double-clicking "Invoke Resolver" on market #1 then #2
  saw the same generic toast and burned a wasted second STT top-up that
  reverted `MarketNotOpen`; `app/api/topics/route.ts` bare `catch {}`
  adds `console.warn` so operators can tell "no topics yet" from "file
  missing"; `DEPLOYED.md` adds "Next deploy" blockquote callout below
  the address table for new maintainers.
- v48 — `lib-web/agentManifest.ts` `version: 'v40'` → `'v47'` (closes
  the on-chain "Contract vN" pill / frontend "Frontend vN" pill drift
  from v45–v47 — the contract pill reads the live on-chain string, the
  frontend pill reads this hardcoded field); `scripts/relayer.mjs`
  `drainTopicFeed` catch log adds `value=${formatEther(topUp)} STT` so
  operators can tell "top-up needed exceeds relayer's cap" from "RPC
  rejecting writes" without cross-referencing `getGenerationFundingStatus`
  manually; `drainTopicFeed` empty-state log so VERBOSE=1 operators
  see the feed is being polled (closes the silent-return pattern that
  hid the v29 TDZ bug); `GenerateMarketForm` auto-redirect useEffect
  invalidates `['nextMarketId']` + `['markets']` so a user who hits
  Back from the auto-redirect sees the just-created market (mirrors
  the v46 L1 CreateMarketForm onSuccess pattern for the agent-created
  sibling path); hoists `const RELAYER_VERSION = 'v48'` to top of
  `relayer.mjs` so the smoke grep + startup log share a single source
  of truth.
- v49 — public docs (README.md:22-23, 142-145 / DEPLOYED.md:6, 22 /
  PITCH_DECK.md:13, 81) headline version sweep — all 5 file/line
  references to the live frontend bumped v40 → v47 (per the v48 M1
  manifest version bump); "v19+v40 contract pending deploy" lists
  extended to v19+v40+v45 (per the v45 M1 on-chain string bump,
  which changes compiled bytecode even though it's not an ABI
  change); v46-v48 explicitly noted as frontend + relayer +
  tooling-only; `app/proof/page.tsx:187-195` Tooltip rewritten to
  explain the new dual-pill invariant (the on-chain label v40 and
  the frontend label v47 intentionally drift — the gap is the
  count of frontend-only audit cycles since the last ABI change,
  not a bug); 4 server-side bare `catch {}` blocks in
  `app/api/receipt/[requestId]/route.ts` (fetch-threw at L90,
  normalize-threw at L120, fallback-fetch-threw at L158) and
  `app/api/receipt/by-tx/[hash]/route.ts` (malformed log at L105)
  gained `console.warn` per the v47 L1 `/api/topics` pattern
  (operators hitting a 502/599/malformed-log can now read the
  dev-server logs); 8 client-side bare `catch {}` blocks in
  `hooks/useAgentReceipt.ts:54`, `hooks/useMarketCreatedByRequestId.ts:53,72`,
  `hooks/useGenerationFailures.ts:55,72`, `hooks/useRpcHealth.ts:75`
  gained `// v49 (L2) silent-return is intentional` attribution
  comments (the pre-existing comments on
  `useGenerationFailures.ts:104,121` were left alone — they already
  explain the local rationale). No contract, no relayer behavior,
  no Foundry test changes.
- v50 — `DEPLOYED.md` body changelog sweep (5 surfaces: L158 section
  header bumped v40 → v48 hardening, L160-165 body text bumped
  v22-v40 → v22-v48 / 19 shipped → 27 shipped / v45 string bump
  annotation, L167 changelog title bumped v8-v40 → v8-v48, L249-396
  "Frontend-only v22-v40" section extended with v41 (README drift),
  v42 (proof-page copy asymmetry), v43 (PayoutClaim myBets +
  readInferenceTopUp), v44 (Dockerfile + .env.example + pnpm
  deploy), v45 (manifest version + BetPanel invalidation), v46
  (CreateMarketForm + ResolutionPanel invalidation + PITCH_DECK
  drift), v47 (deploy.sh portable + AgentCommandCenter pendingInvoke
  + /api/topics console.warn + DEPLOYED.md "Next deploy" callout),
  v48 (manifest version bump + relayer log clarity + GenerateMarketForm
  auto-redirect invalidation + RELAYER_VERSION constant) entries,
  L398-399 test count bumped 112/112 → 113/113);
  `lib-web/agentManifest.ts:354` `judgingAlignment.autonomousPerformance`
  field appended a v45+v46+v47+v48 sentence (the existing
  per-version narration ended at v40, so an external agent reading
  the manifest would conclude the project stopped at v40);
  `components/markets/GenerateMarketForm.tsx:5` `useQueryClient`
  import path fixed (was `wagmi`, should be `@tanstack/react-query` —
  the v48 L2 ship used the wrong package; caught by `pnpm build`
  for v50 since the v48 audit only ran `pnpm lint`, which doesn't
  type-check). No contract, no relayer behavior, no Foundry test
  changes.
- v51 — `lib-web/agentManifest.ts:251` `version: 'v47'` → `'v50'`
  (the v48 M1 manifest version bump pattern said the field should
  bump on every `git push` to Vercel; v49 + v50 polish shipped
  without a corresponding bump); `scripts/relayer.mjs:60`
  `RELAYER_VERSION = 'v48'` → `'v50'` (the v48 L3 invariant said
  "smoke grep + startup log share a single source of truth" — the
  constant was stuck at v48 even though the manifest bumped to
  v47); `scripts/relayer-smoke.sh:51,52,54` grep + echo lines
  updated to match; `app/proof/page.tsx:196` Tooltip content
  bumped "v47, bumped by v48 M1" → "v50, bumped by v51 M1" (the
  v49 M2 Tooltip explainer now correctly credits v51 as the
  latest bump); `app/proof/page.tsx:187-195` comment block gap
  explanation advanced from "v45+v46+v47+v48" to
  "v45+v46+v47+v48+v49+v50"; `README.md:22-23, 145` headline
  version + changelog title bumped (v47 → v50 / v22-v48 →
  v22-v50 / v48 hardening → v51 hardening); `PITCH_DECK.md:13, 81`
  bumped (v46-v48 → v46-v51). The v49 L2 attribution comment
  pattern extended to 4 sites it originally missed:
  `components/receipts/AgentReceiptViewer.tsx:149` gains a
  v51 attribution comment (no comment at all pre-v51);
  `components/market/ResolutionPanel.tsx:85` gains a v51
  attribution line on top of the pre-existing malformed-log
  comment; `lib-web/agents.ts:195` gains a v51 attribution
  comment (no comment at all pre-v51); `lib-web/agents.ts:224`
  gains a v51 attribution line on top of the pre-existing
  createMarket-decode comment. No contract, no relayer behavior,
  no Foundry test changes.

**Test count: 113/113 Foundry tests pass** (105 prior + 7 new for
v40 `getUserMarkets` + 1 new for v45 `testAgentManifestAdvertisesV40`).

**This is the deployed state as of 2026-06-09.** The v19+v40+v45 bytecode is live at `0x48556EA096F4abFFB569916a138Ec946B54A85dE`; the relayer is running on Railway; the frontend is on Vercel. The v15 address (`0x764Dc…2022b`) is now historical. For the next redeploy workflow, see [`DEPLOY.md`](./DEPLOY.md) at the repo root.

## Previous deployment (v14 — 9 audit gaps closed) — historical

v14 closed the 9 issues surfaced by a fresh audit of the v13 deployment
(2 HIGH + 4 MEDIUM + 3 LOW). All change-types were additive — the
resolution pipeline, the generation pipeline, the relayer invocation,
and the receipt proxy URL shape are unchanged. **Caveat:** v14 contained
the H1 parseRequestedAt-rollback bug noted in the v15 section above;
v15 fixes it.

**Contract (5 fixes)**
- **H1 — `_parseYesNo` requires exact 2-byte `NO` and 3-byte `YES` (NOT a
  starting-with-`N` check).** The v9 hardening pass tightened YES/NO to
  exact-byte match, but a copy-paste in the implementation re-anchored NO
  to `length == 3`, so an agent returning the literal 2-byte `"NO"` (the
  platform's documented shape) was rejected and the market silently
  re-opened. v14 splits the two literals — `YES` must be 3 bytes
  (`'Y','E','S'`), `NO` must be 2 bytes (`'N','O'`). Backed by
  `testInferenceCallbackResolvesNoOutcome` (regression) and
  `testInferenceCallbackRejectsNooLiteral` (defensive).
- **M-context — `AgentMarketContext` gains `parseRequestedAt` and
  `inferenceRequestedAt`.** These mirror the v11 fields that already
  power `scanStuckMarkets` / `_isStuckRequest` internally, but were not
  exposed to external agents. External observers can now compute
  "is this market stuck?" without an off-chain timestamp tracking the
  parse/inference request. Updated the doc comment on
  `_isGenerationStuck` to make the dual-predicate invariant
  (`requestStage != None AND elapsed > STALE_REQUEST_TIMEOUT`) explicit.
- **M4 — `DuplicateToolCall(uint256 indexed requestId, uint256 toolCallCount)`
  advisory event.** If the LLM returns more than one `createMarket` call
  in `pendingToolCalls`, v14 still processes the *first* one (so a
  well-formed market is always created), but emits the event so external
  watchers can see the misbehavior. This is observability only — the
  wrong-selector and create-reverted paths remain in `GenerationFailed`
  with their v13 reason codes.
- **L3 — agent manifest text corrected to "exact 2-byte `NO` / 3-byte
  `YES`".** The v9 manifest text read "exactly 3-byte `YES` or `NO`"
  (it was a typo carried forward from the v9 hardening; the v9 code
  only matched `length == 3` for both). v14 fixes the wording to match
  the actual (now-correct) parser contract. Bumps to v14.
- **L1 — receipt proxy passes `upstreamStatus` through on both 404 and
  502 responses.** The previous proxy only sent a body error; v14
  threads the upstream status so the client can distinguish
  "throttled" / "platform down" / "stale link". 404 and 502 responses
  now both include `upstreamStatus` as a top-level field.

**Relayer (1 fix)**
- **M3 — `RESET_MAX_ATTEMPTS = 3` per-reset cap.** `tryResetStuckMarket`
  and `tryResetStuckGeneration` now track attempts in a separate
  `resetAttemptCount` Map (keyed `reset:<id>` and `resetgen:<id>` to
  avoid collision with the existing `tryResolveMarket` budget). After
  3 attempts the relayer logs a "needs operator intervention" warning
  and stops trying that id. Clears on success. Closes the same gas-DoS
  vector the v10 per-market retry cap closed for the resolution path,
  but for the reset path. New log line: `[relayer] starting (v14)`.

**Frontend (2 fixes)**
- **M2 — `useAgentReceipt(requestId, kind)` and `AgentReceiptViewer`
  branch on `kind`.** Resolution receipts gate real on-chain payouts (a
  stuck receipt means a market is stuck in `Resolving`), so the
  long-running copy points users to the operator recovery path on the
  proof page. Generation receipts are advisory — the inference deposit
  was forwarded at request time and is not refundable — so the
  long-running copy honestly notes that. The same
  `upstreamStatus`-driven branching is applied to the error message
  ("platform is throttling" vs "platform appears to be down" vs "stale
  link").
- **L3 — `lib-web/contract.ts` `Market` type extended with
  `parseRequestedAt` and `inferenceRequestedAt` (matching the new
  contract fields).** Required for `AgentCommandCenter`'s recovery
  panel to read them through `getAgentMarketContext`.

**On-chain surface summary** (additive only):
- `AgentMarketContext` struct gains two `uint256` timestamp fields.
- New event: `DuplicateToolCall(uint256 indexed requestId, uint256 toolCallCount)`.
- `agentManifest()` body bumps to v14.

**Test coverage:** 82/82 Foundry (was 79/79 on v13). New tests:
- `testInferenceCallbackResolvesNoOutcome` — regression for H1.
- `testInferenceCallbackRejectsNooLiteral` — defensive for H1.
- `testAgentContextAndScanExposeResolvableMarkets` extended — asserts
  the two new `AgentMarketContext` timestamp fields across three
  states (initial, after `requestResolution`, after parse callback).
- `testRequestMarketGenerationEmitsDuplicateToolCallAdvisory` —
  sends 3 `createMarket` tool calls, asserts `nextMarketId == 2` and
  the `DuplicateToolCall` event reports `toolCallCount = 3`.
- `testAgentManifestAdvertisesV14` (renamed from v13) — v14 manifest
  asserts: 2-byte NO wording, `DuplicateToolCall` event in the
  enumeration, and the `AgentMarketContext` timestamp fields.

## Previous deployment (v13 — 5 audit gaps closed) — historical

v13 closed the 5 issues surfaced by a fresh audit of the v12 deployment
(1 HIGH + 2 MEDIUM + 2 LOW). All change-types were additive — the
resolution pipeline, the generation pipeline, the relayer invocation,
and the receipt proxy URL shape are unchanged. **Caveat:** v13 contained
the H1 NO-outcome parser regression noted above; v14 fixes it.

**Contract (4 fixes)**
- **Stuck-generation recovery (symmetric to v11's stuck-resolution recovery).**
  A generation request whose callback never arrives (platform drop, validator
  stall) used to leave the inference deposit in limbo forever, since the
  relayer had no path to detect it. v13 adds:
  - `scanStuckGenerationRequests(cursor, limit)` — agent-discoverable surface
    mirroring `scanStuckMarkets`, walking `[cursor, lastGenerationRequestId]`
    with a tight upper bound (high-water mark set on every
    `requestMarketGeneration`).
  - `forceResetGeneration(requestId)` — `nonReentrant`, clears the four state
    mappings (`requestStage`, `requestToTopic`, `generationProposer`,
    `generationRequestedAt`) and emits `GenerationReset(uint256 indexed
    requestId, address indexed resetBy)`. Reverts `GenerationNotStuck` if the
    request is fresh or already cleared. The relayer can now drive this
    automatically on every tick.
  - The user's inference deposit was forwarded to the platform at request
    time and is *not* refundable — this is consistent with the existing
    `ResolutionFailed` failure path, which also drops the deposit.
- **Agent output length cap (`MAX_AGENT_OUTPUT_LENGTH = 1024` bytes).** A
  misbehaving or jailbroken agent could return a multi-MB string, which
  would bloat chain state via `market.resolutionReason` and the inference
  prompt (the prompt is built from the parse result). v13 caps both the
  parse and inference callbacks at 1 KiB.
- **Over-long responses treated as graceful failure, not a revert.** A
  revert in `handleAgentResponse` / `handleInferenceCallback` would leave
  the market stuck in `Resolving` for `STALE_REQUEST_TIMEOUT` (30 min)
  before the relayer could force-reset it. v13 emits `ResolutionFailed`
  and reopens the market immediately, so the relayer can retry on the
  next tick. *The contract never reverts in callbacks.*
- **`lastGenerationRequestId` high-water mark.** Each
  `requestMarketGeneration` call sets this to `max(current, requestId)`.
  The stuck-generation scan reads it as its upper bound so it doesn't
  walk the entire uint256 space. It's a sticky high-water mark, not a
  state pointer (the `forceResetGeneration` test asserts this).

**Relayer (2 fixes)**
- **`scanStuckGenerationRequests` + `tryResetStuckGeneration` tick step.**
  Mirrors the existing `scanStuckMarkets` / `tryResetStuckMarket` pattern.
  The relayer emits a console note that the inference deposit was
  forwarded to the platform at request time and is not refundable.
- **`drainGenerationFailureEvents` advisory log step.** `GenerationFailed`
  is *not* auto-retried (a "wrong-selector" / "no-tool-calls" failure
  means the proposer's topic was unsolvable by the agent — that's the
  proposer's call to fix and re-submit). The relayer just emits a warning
  with the request id and a link to the agent receipt so the operator
  can see the failure rate. Uses a 50-block backward window (like
  `logResolvedMarkets`) rather than the shared `lastScannedBlock` cursor
  — generation failures are advisory, not act-on-able.
- **New log line:** `[relayer] starting (v13)`.

**Test coverage:** 79/79 Foundry (was 71/71 on v12). Eight new tests:
- `testRequestMarketGenerationTracksLastGenerationRequestId`
- `testForceResetGenerationRevertsWhenNotStuck`
- `testForceResetGenerationRevertsForUnknownRequest`
- `testForceResetGenerationRecoversStuckRequest`
- `testScanStuckGenerationRequestsFindsAndExcludesFresh`
- `testScanStuckGenerationRequestsPagination`
- `testParseCallbackReopensMarketOnOverlongOutput`
- `testInferenceCallbackReopensMarketOnOverlongOutput`

Renamed: `testAgentManifestAdvertisesV12` → `testAgentManifestAdvertisesV13`
(the assertion set expanded to cover the three v13 additions:
`scanStuckGenerationRequests`, `forceResetGeneration`, and
`MAX_AGENT_OUTPUT_LENGTH`).

## Previous deployment (v12 — 3 audit gaps closed) — historical

v12 closed the 3 issues surfaced by a fresh audit of the v11 deployment
(1 MEDIUM + 2 LOW). All change-types were additive — the resolution
pipeline, the generation pipeline, the relayer invocation, and the
receipt proxy URL shape are unchanged.

**Contract (1 fix)**
- **`MarketReset` event gains `stuckRequestId` (non-indexed).** A relayer
  that scans for resets needs to know which platform request id was in
  flight, so it can drop that id from any local retry bookkeeping.
  Previously the relayer had to walk `market.parseRequestId` /
  `market.inferenceRequestId` separately, which was racy under concurrent
  resets. v12 emits the value as part of the event payload.

**Frontend (2 fixes)**
- **`useAgentReceipt` recovery flag reset.** The `isLongRunning` effect
  now sets `isLongRunning(false)` in the healthy-polling branch (was
  sticking on "this is taking longer than expected" once a transient
  upstream error tripped it). Also: the setTimeout is now scheduled
  against `MAX_POLL_MS - (Date.now() - startedAt)` (the *remaining*
  time to the deadline) rather than the full duration. The previous
  effect re-armed with the full duration on every `query.data` update,
  so under continuous polling the timeout could be pushed out
  indefinitely.
- **Receipt proxy 502 path is no longer cached.** The previous logic
  applied `Cache-Control: public, max-age=10` to *both* 404 and 502,
  so a transient upstream 502 would be served from cache for 10s —
  masking a brief outage. v12 only caches 404; 502 responses are
  served without `Cache-Control`, so the next call goes straight to
  the upstream.

**Test coverage:** 71/71 Foundry (was 70/70 on v11). New test:
`testMarketResetEmitsStuckRequestId` (decodes the event log and
asserts the emitted id matches the parse request that was in flight).
Renamed: `testAgentManifestAdvertisesV11` → `testAgentManifestAdvertisesV12`.

The other two findings (`useAgentReceipt` setTimeout reset and
receipt proxy 502 cache) are frontend-only and have no automated test
coverage — the repo has no frontend test framework. They are
defended by the code change itself and a manual review.

**Relayer note:** unchanged invocation. No new env. New log line:
`[relayer] starting (v12)` for sanity-checking which build is running.
The `attemptCount` Map deletion on resolution/reset success (from v11)
remains in place.

## Previous deployment (v11 — 5 audit gaps closed) — historical

v11 closes the 5 issues surfaced by a fresh audit of the v10 deployment:

**Contract (1 fix — HIGH severity)**
- **Stuck-request recovery.** The biggest gap in v10: if a parse or inference
  callback never arrived (platform dropped the request, validator stall), the
  market was stuck in `Resolving` with `parseRequestId != 0`, invisible to
  `scanResolvableMarkets` and `scanForRetryableMarkets`, and emitting no
  `ResolutionFailed` event (so the relayer's event-driven retry path couldn't
  help either). v11 adds:
  - `STALE_REQUEST_TIMEOUT = 30 minutes` constant.
  - `parseRequestedAt` and `inferenceRequestedAt` fields on `Market`,
  populated on `requestResolution` and `_resolveWithLLMInference`, cleared
  by the callbacks and the inference-balance-check rollback.
  - `scanStuckMarkets(cursor, limit)` — agent-discoverable paginated view.
  - `forceResetMarket(marketId)` — anyone can call it once a request is
  stale; reverts the market to `Open` and emits `MarketReset(marketId,
  resetBy, stage)` so the relayer can pick it up.
  - `agentManifest()` bumped to v11; mentions the recovery surface.
  - `via_ir = true` in `foundry.toml` to keep the build passing under the
  extra local-variable pressure.

**Relayer (3 fixes)**
- **`getLogs` chunking.** `drainFailureEvents` and `logResolvedMarkets` now
  walk the `fromBlock..toBlock` range in 1000-block windows via a new
  `getLogsChunked()` helper. On a chunk failure, `lastScannedBlock` is NOT
  advanced, so the relayer retries next tick from the same cursor instead
  of wedging permanently on an oversized range. viem does not auto-chunk
  and the Shannon RPC rejects ranges > ~1000.
- **Per-tick stuck scan.** New `scanStuckMarkets()` step in the main loop
  calls `forceResetMarket` on every stuck market, then clears the
  `attemptCount` slot for that market id.
- **Clear `attemptCount` on resolution success.** When `requestResolution`
  lands on-chain, the previous attempt budget is meaningless (the market
  is now `Resolving` and a future stuck-then-reset market should start
  fresh). Also: `forceResetMarket` on success clears the slot for the
  same reason.

**Frontend (2 fixes)**
- **`useAgentReceipt` refetch on error gate.** `refetchInterval` now also
  returns `false` when `query.state.status === 'error'`. Previously a
  persistent upstream error (502 from the receipt proxy, malformed
  response) would burn through retries and then keep firing every 5s
  forever — the 5-min wall clock was the only stop. The `isLongRunning`
  effect also reacts to `query.error` so the "this is taking longer than
  expected" UI shows up immediately on errors instead of waiting for the
  full 5 minutes.
- **Negative cache on the receipt proxy.** 404 responses now include
  `Cache-Control: public, max-age=10`, so stale links (typos, never-valid
  requestIds) don't round-trip to the upstream on every page view.
  10 s is short enough that a real receipt appearing within seconds of
  the link being opened is still served live.

**Test coverage:** 70/70 Foundry (was 63/63 on v10). New tests:
`testForceResetMarketRevertsWhenNotStuck`,
`testForceResetMarketRevertsWhenRequestIsFresh`,
`testForceResetMarketRevertsWhenMarketNotFound`,
`testForceResetMarketRecoversStuckParseRequest`,
`testForceResetMarketRecoversStuckInferenceRequest`,
`testScanStuckMarketsFindsAndExcludesFreshRequests`,
`testScanStuckMarketsPagination`. Renamed:
`testAgentManifestAdvertisesV10` → `testAgentManifestAdvertisesV11`.

**Relayer note:** unchanged invocation. New optional env unchanged from v10.
The `attemptCount` Map is now deleted on resolution success and on
successful `forceResetMarket`, so an operator who refills the contract and
restarts the relayer (or lets a recovery happen) gets a fresh budget
without a full restart. New env: `RELAYER_MAX_TOPUP_STT` (default 1) —
same as v10.

## Previous deployment (v10 — 12 audit gaps closed) — historical

v10 closes the 12 issues surfaced by a fresh audit of the v9 deployment,
grouped into four buckets:

**Contract (3 fixes)**
- `handleInferenceCallback` now reverts on `Pending`/`None` (was silently
  re-opening the market and exposing a brief betting window). Mirrors the
  parse callback.
- `_resolveWithLLMInference` rollback now emits `stage=Inference` (was
  `ParseWebsite`) to match the actual failure point. The parse already
  succeeded; only the inference call couldn't be made.
- `agentManifest()` body rewritten as `string.concat(...)` and bumped to v10.
  Enumerates the actual surface (scan + create agent surfaces, return
  `requestId`, `MIN_BET`, exact 3-byte `YES`/`NO`, case-insensitive URL,
  leading whitespace allowed, stuck-market Inference-stage rollback, 500-char
  question, SPECIFIC-URL constraint).
- Generation prompt: `question <= 200 chars` → `question <= 500 chars`
  (matches `MAX_QUESTION_LENGTH`).

**Relayer (4 fixes)**
- **Critical: dedup key normalization.** The Set now normalizes via
  `BigInt(marketId).toString()`, so a market appearing in both the failure
  event stream (hex) and the scan (decimal) hits the same Set entry.
  Previously the second submission reverted with `MarketNotOpen`.
- **Per-market retry cap (`RELAYER_MAX_ATTEMPTS`, default 5).** After N
  consecutive attempts the relayer logs "needs operator refill" and stops
  trying that market. Resets on relayer restart. Closes the gas DoS vector
  where a permanently underfunded contract would drain the relayer EOA via
  infinite resubmits.
- `getResolutionFundingStatus()` re-read inside `tryResolveMarket` instead
  of hoisted to the top of the tick. A successful resolution that drains
  the contract earlier in the same tick would otherwise use a stale
  (inflated) `topUp` for subsequent submissions.
- Env rename: `RELAYER_MAX_BET_GAS` → `RELAYER_MAX_TOPUP_STT`. The old name
  is honored as a deprecated alias.

**Frontend (3 fixes)**
- `useAgentReceipt` stops polling after 5 minutes and exposes an
  `isLongRunning` flag. `AgentReceiptViewer` shows a "this is taking
  longer than expected" message with a manual Refresh button instead of
  an infinite spinner.
- Receipt proxy uses `revalidate: 5` to absorb repeated views of the same
  receipt. Client polls every 5s, so 5s revalidate keeps the UI live
  while collapsing upstream calls.
- `CreateMarketForm` mirrors the contract's `_isHttpUrl` in JS:
  `^\s+` trim + case-insensitive `http(s)` check. Catches `ftp://`,
  `javascript:`, bare hostnames, etc. before the user signs a tx.

**Naming (2 fixes)**
- `RELAYER_MAX_BET_GAS` env name was misleading (it caps the resolution
  top-up, not bets). Renamed to `RELAYER_MAX_TOPUP_STT`; old name still
  honored for one release.
- Generation prompt's `question <= 200 chars` was a holdover from the v5
  prompt; aligned with the contract's `MAX_QUESTION_LENGTH = 500`.

| Step | Detail |
|---|---|
| **Contract** | `0x6c94AA83e2C8D1d8f22B1E17537D8736E3d7fB65` |
| **Deployer** | `0x119F9fd07C09B7AD45Ac45c6797e2c2FB97a5fD6` |
| **Pre-fund** | 1.0 STT |
| **Seed markets** | #1 (Paris, 5 min), #2 (Bitcoin, 5 min) |
| **`AGENT_CREATOR_SENTINEL`** | `0x00000000000000000000000000000000000000A1` |
| **Test coverage** | 63/63 Foundry tests (was 61/61 on v9) |

## Latest deployment (v9 — last autonomy gaps closed) — historical

v9 is the current live contract. It keeps every v8 guarantee and closes the remaining
gaps surfaced by an in-depth audit of the v8 deployment:

| Step | Detail |
|---|---|
| **Contract** | `0x7D47a5eF4BE519D1B712C8609a100f27D6c4Eb7E` |
| **Deployer** | `0x119F9fd07C09B7AD45Ac45c6797e2c2FB97a5fD6` |
| **Pre-fund** | 1.0 STT |
| **Seed markets** | #1 (Paris, 5 min), #2 (Bitcoin, 5 min) |
| **`AGENT_CREATOR_SENTINEL`** | `0x00000000000000000000000000000000000000A1` |
| **Test coverage** | 61/61 Foundry tests (was 58/58 on v8) |

### Why v9

The v8 contract was functionally complete but had five correctness/efficiency issues
and three code-hygiene ones:

- **Stuck-market bug**: if the contract's balance fell below the inference deposit
  at the moment `_resolveWithLLMInference` ran, the market would silently stay in
  `Resolving` forever with no retry path. v9 rolls the market back to `Open`, clears
  `parseRequestId`, and emits `ResolutionFailed` so the relayer can retry once the
  contract is refilled.
- **Loose `YES`/`NO` parsing**: `_parseYesNo` accepted any string starting with
  `Y`/`y`/`N`/`n`, so `"YEAH"`, `"Yessir"`, and `"NOOOOOO"` would all resolve.
  v9 requires an exact 3-byte `YES` / `NO` match.
- **`GenerationFailed` semantic bug**: the inner-revert branch was hardcoding
  `ResponseStatus.Failed` even when the platform response had succeeded. v9
  passes the original `status` so agents monitoring the event stream see the
  real outcome.
- **Case-sensitive URL scheme**: `_isHttpUrl` rejected `HTTPS://…` and any
  leading whitespace. v9 is case-insensitive (per RFC 3986 §3.1) and trims
  leading ASCII whitespace.
- **Dead error declarations**: `BetAmountRequired`, `InvalidInferenceOutput`,
  `InvalidGenerationOutput`, `InvalidToolSelector`, `NoResolverRefund` — removed.

### Relayer v9 changes

`scripts/relayer.mjs` had three efficiency issues that compound on a long-running
watchdog:

- **O(N) market scan**: was calling `getAgentMarketContext` once per market id.
  Now paginates via the contract's own `scanResolvableMarkets(cursor, 50)`.
- **Duplicate submissions**: a market that appeared in both the failure-event
  stream and the scan would be re-submitted (the second call would revert
  with `MarketNotOpen`). Now a single `Set` per tick dedupes both paths.
- **Per-market funding read**: was reading `getResolutionFundingStatus()` once
  per `tryResolveMarket` call. Now reads it once per tick and passes the
  `topUp` through.

## Latest deployment (v5 — fully autonomous) — historical

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

## Latest deployment (v8 — full hardening + relayer) — historical

v8 was a defense-in-depth + observability pass that kept the prompt/bytecode-shape the same:

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

## On-chain state (current v14)

- v14 Market **#1**: "Is the capital of France Paris?" — seeded, 5-min demo (Wikipedia source, `creator = 0x119F…5fD6`)
- v14 Market **#2**: "Did Bitcoin exist before 2010?" — seeded, 5-min demo (Wikipedia source, `creator = 0x119F…5fD6`)
- v14 Contract balance: `1.0 STT`
- v14 `nextMarketId`: `3`
- v14 `AGENT_CREATOR_SENTINEL`: `0x00000000000000000000000000000000000000A1`
- v14 `MAX_AGENT_OUTPUT_LENGTH`: `1024` (1 KiB cap on agent responses — parse + inference)
- v14 `STALE_REQUEST_TIMEOUT`: `1800` seconds (30 min, unchanged from v11)
- v14 `lastGenerationRequestId`: `0` (no generation requests yet)
- v14 new event: `DuplicateToolCall(uint256 indexed requestId, uint256 toolCallCount)` — advisory only, emitted when an inference agent returns >1 `createMarket` tool call in a single `inferToolsChat` response
- v14 new event (inherited from v13): `GenerationReset(uint256 indexed requestId, address indexed resetBy)` — emitted by `forceResetGeneration` after clearing the four state mappings
- v14 `MarketReset` event: same v12 shape — `MarketReset(uint256 indexed marketId, address indexed resetBy, RequestStage stage, uint256 stuckRequestId)`
- v14 `AgentMarketContext` struct: extended with `uint256 parseRequestedAt` and `uint256 inferenceRequestedAt` (mirror the v11 internal fields that now power external agent stuck-detection)
- v14 new contract surface: `AgentMarketContext` returns the two new timestamp fields; the rest of the recovery surface (`scanStuckMarkets`, `forceResetMarket`, `scanStuckGenerationRequests`, `forceResetGeneration`) is unchanged from v13
- v14 `_parseYesNo`: exact 2-byte `NO` / 3-byte `YES` match required — fixes the v9/v13 regression that mis-matched `NO` at 3 bytes
- v14 `agentManifest()` body bumped to v14 — adds `DUPLICATE-TOOL-CALL ADVISORY` section; wording for the YES/NO constraint is now correct
- v14 inherits all v13 behavior: stuck-resolution recovery, stuck-generation recovery, output cap, non-reverting callbacks, `lastGenerationRequestId` high-water mark, relayer GenerationFailed advisory log, v12 `MarketReset.stuckRequestId`, useAgentReceipt recovery reset + setTimeout remaining-time fix, 404-only cache on the receipt proxy, relayer getLogs chunking, attemptCount clear-on-success, MIN_BET, URL validation, nonReentrant, case-insensitive URL, paginated relayer, inference-callback Pending guard, honest rollback stage, fresh manifest, receipt polling timeout, client-side URL validation, per-market retry cap, per-tick topUp re-read

## On-chain state (v13 — historical)

- v13 Market **#1**: "Is the capital of France Paris?" — seeded, 5-min demo (Wikipedia source, `creator = 0x119F…5fD6`)
- v13 Market **#2**: "Did Bitcoin exist before 2010?" — seeded, 5-min demo (Wikipedia source, `creator = 0x119F…5fD6`)
- v13 Contract balance: `1.0 STT`
- v13 `nextMarketId`: `3`
- v13 `AGENT_CREATOR_SENTINEL`: `0x00000000000000000000000000000000000000A1`
- v13 `MAX_AGENT_OUTPUT_LENGTH`: `1024` (1 KiB cap on agent responses — parse + inference)
- v13 `STALE_REQUEST_TIMEOUT`: `1800` seconds (30 min, unchanged from v11)
- v13 `lastGenerationRequestId`: `0` (no generation requests yet)
- v13 new events: `GenerationReset(uint256 indexed requestId, address indexed resetBy)` — emitted by `forceResetGeneration` after clearing the four state mappings
- v13 `MarketReset` event: same v12 shape — `MarketReset(uint256 indexed marketId, address indexed resetBy, RequestStage stage, uint256 stuckRequestId)`
- v13 new contract surface: `scanStuckGenerationRequests(uint256 cursor, uint256 limit) → (uint256[] requestIds, uint256 nextCursor)`; `forceResetGeneration(uint256 requestId) external nonReentrant` (reverts `GenerationNotStuck` if fresh or cleared)
- v13 `agentManifest()` body bumped to v13 — adds `STUCK-GENERATION RECOVERY`, `OUTPUT CAPS` sections; enumerates the v12 `MarketReset.stuckRequestId` field
- v13 inherits all v12 behavior: stuck-resolution recovery (forceResetMarket + scanStuckMarkets + STALE_REQUEST_TIMEOUT), `MarketReset.stuckRequestId`, useAgentReceipt recovery reset + setTimeout remaining-time fix, 404-only cache on the receipt proxy, relayer getLogs chunking, attemptCount clear-on-success, MIN_BET, URL validation, nonReentrant, exact 3-byte YES/NO parse, case-insensitive URL, paginated relayer

## On-chain state (v12 — historical)

- v12 Market **#1**: "Is the capital of France Paris?" — seeded, 5-min demo
- v12 Market **#2**: "Did Bitcoin exist before 2010?" — seeded, 5-min demo
- v12 Contract balance: `1.0 STT`
- v12 `nextMarketId`: `3`
- v12 `AGENT_CREATOR_SENTINEL`: `0x00000000000000000000000000000000000000A1`
- v12 `MarketReset` event: `MarketReset(uint256 indexed marketId, address indexed resetBy, RequestStage stage, uint256 stuckRequestId)` — the `stuckRequestId` field is non-indexed and matches the in-flight parse or inference request id

## On-chain state (v11 — historical)

- v11 Market **#1**: "Is the capital of France Paris?" — seeded, 5-min demo (Wikipedia source, `creator = 0x119F…5fD6`)
- v11 Market **#2**: "Did Bitcoin exist before 2010?" — seeded, 5-min demo (Wikipedia source, `creator = 0x119F…5fD6`)
- v11 Contract balance: `1.0 STT`
- v11 `nextMarketId`: `3`
- v11 `AGENT_CREATOR_SENTINEL`: `0x00000000000000000000000000000000000000A1`
- v11 `MarketReset` event: `MarketReset(uint256 indexed marketId, address indexed resetBy, RequestStage stage)` — v12 added the `stuckRequestId` field
- v11 `_parseYesNo`: exact 3-byte `YES`/`NO` match required — `"YEAH"` no longer resolves
- v11 `_resolveWithLLMInference` rollback: emits `stage=Inference` (not `ParseWebsite`) so the failure point is honest

## On-chain state (v9 — historical)

- v9 Market **#1**: "Is the capital of France Paris?" — seeded, 5-min demo (Wikipedia source, `creator = 0x119F…5fD6`)
- v9 Market **#2**: "Did Bitcoin exist before 2010?" — seeded, 5-min demo (Wikipedia source, `creator = 0x119F…5fD6`)
- v9 Contract balance: `1.0 STT` (covers 1.5× the parse+inference deposit; rest is for retry top-ups via the relayer)
- v9 `nextMarketId`: `3`
- v9 `AGENT_CREATOR_SENTINEL`: `0x00000000000000000000000000000000000000A1`
- v9 `MIN_BET`: `0.001 ether` (reverts `BetBelowMinimum` for smaller bets)
- v9 `createMarket` requires `http://` or `https://` source URLs, case-insensitive, leading whitespace allowed (reverts `InvalidSourceUrl` otherwise)
- v9 `_parseYesNo`: exact 3-byte `YES`/`NO` match required — `"YEAH"` no longer resolves

## On-chain state (v8 — historical)

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
- `NEXT_PUBLIC_CONTRACT_ADDRESS=0x48556EA096F4abFFB569916a138Ec946B54A85dE`

## Auto-retry relayer

`scripts/relayer.mjs` is an always-on watchdog that turns "fully autonomous" from a
one-shot demo into a recoverable loop. It watches the contract for
`ResolutionFailed` events and any open markets past `endTime` without a parse
request, then re-submits `requestResolution` with the wallet's top-up.

```bash
PRIVATE_KEY=0x... \
  NEXT_PUBLIC_CONTRACT_ADDRESS=0x48556EA096F4abFFB569916a138Ec946B54A85dE \
  node scripts/relayer.mjs
```

Optional env:
- `SHANNON_RPC_URL` (default `https://dream-rpc.somnia.network`)
- `RELAYER_POLL_MS` (default 30 seconds)
- `RELAYER_MAX_TOPUP_STT` (default 1 STT — refuses to top up markets needing more; `RELAYER_MAX_BET_GAS` is honored as a deprecated alias)
- `RELAYER_MAX_ATTEMPTS` (default 5 — per-market resubmit cap before the relayer stops trying; reset by restarting after refilling the contract)
- `RELAYER_RESET_MAX_ATTEMPTS` (default 3, v14 — per-reset attempt cap for the forceResetMarket / forceResetGeneration paths)
