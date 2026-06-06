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
- **Current contract (v19 — pending deploy; v15/v16/v17/v18 still live)**:
  `0x764Dc86246D242382c7619Fc715d0E3A64B2022b` is the **v15** address (also
  represents v16/v17/v18 — all four contracts share the same v15 address
  family because none have been deployed; only the v19 contract is
  build-ready). v19 is fully tested (104/104 Foundry) and ready for
  `./scripts/deploy.sh` to ship a fresh contract address on Somnia Shannon
  Testnet (chain id `50312`, RPC `https://dream-rpc.somnia.network`).
- **Live app (v34)**: `autoresolve-somnia.vercel.app`. Proof page at `/proof`,
  agent manifest at `/api/agent-manifest` and
  `/.well-known/autoresolve-agent.json`.
- **Historical E2E proof (v2)**: market #1 on the v2 contract resolved `YES`
  via parse receipt `2400421` and inference receipt `2400485`; winnings
  claimed on-chain (`claimTx: 0x888327…2380`).
- **v7 E2E AI-created→AI-resolved proof**: market #3 on v7
  (`0xd3E946aC…4B69`) was created by the inference agent (via
  `requestMarketGeneration` → `inferToolsChat` → `createMarket` calldata) and
  resolved YES via parse receipt `4254170` and inference receipt `4254291`
  (tx `0x362daa6f…b5143`).

### Version history

The contract has been hardened through v8–v19 (Foundry) and the frontend /
relayer through v22–v34. Each version's full diff lives in the
`auto-resolve-v*-hardening` memory files in
`~/.claude/projects/-Users-choguun-Documents-workspaces-hackathon-AutoResolve-Somnia/memory/`.
Memory pointer list at the bottom of this file (`[[...]]`).

Quick reference for "what shipped when":

- **v19 contract (pending deploy)** — final Foundry-tested contract. Adds
  `getGenerationPromptTemplate()` view, hoists `marketParseResult` cleanup
  to top of `handleInferenceCallback` (symmetric with v18 M1's
  `handleAgentResponse` fix), `PayoutClaim` invalidates `userBets` on
  success, relayer `tryResetStuckMarket` clears `nextRetryAt`, receipt proxy
  wraps `normalizeMinimalReceipt` in try/catch + `Cache-Control` on 5xx,
  `ResolutionPanel` filters by event signature, `formatStt` /
  `formatCountdown` precision safety.
- **v22 frontend** — `formatStt` restores pre-v19 0.001-STT exponential
  threshold (v19 L2 regressed sub-1-STT amounts to scientific notation);
  `endTimeMs` helper consolidated out of `formatCountdown` so all three
  callers (`useResolutionStatus`, `BetPanel`, `formatCountdown`) use the
  same uint32 clamping. Frontend-only — no contract change.
- **v23 frontend/relayer** — `?kind=generation` query param threaded
  through `GenerateMarketForm` + `AgentCommandCenter` → `AgentReceiptViewer`
  (closes "View live inference receipt" landing on resolution copy);
  `/proof` "Live version" label reads from
  `getAutoResolveAgentManifest().version` (was hardcoded "v3 contract");
  `useMyBets` triggers `fetchNextPage()` on tab switch (closes silent gap
  for late-id markets); relayer `drainGenerationFailureEvents` uses
  module-level FIFO Set for persistent dedup.
- **v24 frontend/relayer** — `extractGenerationToolCall`
  decodes the `createMarket(string,string,uint256)` calldata from
  generation receipts and surfaces Question/Source/Duration in
  `AgentReceiptViewer` (was previously showing the model's narration or
  raw hex); `/proof` "Latest Agent-Discoverable Deployment" now shows two
  pill badges (`Frontend v24` / `Contract v19 (pending deploy)`) plus a
  tooltip explaining the split; relayer `drainGenerationFailureEvents`
  decodes the `(uint8 status, string reason)` data from `GenerationFailed`
  events via `decodeAbiParameters` and logs the reason inline (was
  swallowing the most useful debug signal); `useGenerationFailures` hook
  reads the last 5000 blocks of `GenerationFailed` events and
  `AgentCommandCenter` surfaces them in a new recovery card with a
  "Re-run with different topic" shortcut to `GenerateMarketForm`;
  `formatCountdown` returns `'Ended'` (not `'>99y'`) for
  `endTime > 0xFFFFFFFFn` to match `endTimeMs`'s "already ended" semantic.
- **v25 frontend/relayer** — `agentManifest.version` bumped v22 → v24
  (proof page's `Frontend vN` pill is wired to this field as the
  single source of truth); `MarketContextCard` now renders the
  `parseResultCached` field as a 5th `MiniMetric` so operators can
  see when a relayer-routable cache is on-chain (v19 M2 added the
  type field but never wired the render); `useMyBetsMarkets` query
  key swaps the `id,id,id,...` join for `markets.length` to stop
  every new market from invalidating the position cache and
  triggering an O(2N) re-read; relayer startup log bumped
  `(v16)` → `(v24)`; receipt viewer's Refresh button now disables
  during refetch (was vulnerable to double-click concurrent
  refetches); My Bets tab shows a claimable-count chip
  (Resolved + winning side = claimable) so users with many
  positions can find unclaimed winnings; both manifest route
  handlers merge the on-chain `getGenerationPromptTemplate()`
  view over the static fallback so the JSON manifest reflects
  the live prompt the contract sends to the inference agent.
- **v26 frontend/server** — new `lib-web/agentManifestServer.ts`
  wraps `getGenerationPromptTemplate()` in `unstable_cache` (5 min
  revalidate) and uses a module-level publicClient, collapsing
  v25 L3's per-request RPC round-trips into a single cached read;
  receipt proxy imports `SOMNIA_PLATFORM_ADDRESS` from
  `lib-web/agents.ts` instead of redeclaring the platform address
  locally; receipt proxy 404/502 `Cache-Control` max-age tightened
  from 10s to 2s so a 5s polling client never sees a stale 404 for
  a full polling cycle; `AgentCommandCenter` surfaces the
  `useGenerationFailures` hook's `isError` state as an amber
  "RPC unavailable" chip + dimmed card border + alternate
  empty-state copy so operators can tell "no failures" apart
  from "hook failed to fetch."
- **v27 frontend** — `useAgentReceipt.refetchInterval`
  drops the 5-min `MAX_POLL_MS` cap so a healthy-but-slow pipeline
  (slow LLM, queued validator, brief platform hiccup) can still
  surface its result; the constant is retained as a UI threshold
  and `AgentReceiptViewer`'s success path now renders an amber
  "this is taking longer than expected" banner (with Refresh
  button) when `isLongRunning && !receiptIsComplete(receipt)`,
  branching on receipt kind — generation receipts point to the
  unrecoverable inference deposit, resolution receipts point to
  the on-chain force-reset path after 30 min; `useGenerationFailures`
  drops a dead `events: {} as never` no-op from its `getLogs` call
  (was silencing viem's type check on an empty events object —
  semantically identical to omitting the field).
- **v28 contract+relayer** — swaps the relayer
  main-loop drain order so `drainInferenceUnderfundedEvents` (the
  cache-aware `retryInferenceFromCache` path) runs BEFORE
  `drainFailureEvents` (the wasteful-re-parse path). Pre-v28, when
  both events fired for the same market in the same tick,
  `drainFailureEvents` ran first, called `requestResolution`, and
  the v17 H1 up-front cache clear wiped the cache — leaving
  `drainInferenceUnderfundedEvents`'s `hasCachedParse` pre-check to
  return false and the relayer to call the wasteful re-parse AND
  skip the cache retry, two network calls where one would have
  done. The swap gives the cache-aware path the first shot;
  `drainFailureEvents` still runs as the fallback for parse-stage
  failures where `retryInferenceFromCache` isn't applicable. On the
  contract side, moves `delete marketParseResult[marketId]` in
  `requestResolution` to AFTER the `InsufficientContractBalance`
  check — a reverted (underfunded) call used to destroy the cache
  as a side effect, removing the relayer's only retry path for
  that market. The v17 H1 invariant ("a parse request in flight
  never has a cache") still holds on the success path; the new
  guarantee is "a reverted `requestResolution` does not destroy
  the cache either." 105/105 Foundry tests pass (104 prior + 1
  L1 regression). No frontend change.
- **v29 relayer+frontend** (this audit cycle) — H1 adds
  `drainTopicFeed` to the relayer's main loop. Reads
  `scripts/topics.txt` (or `$GENERATION_TOPICS_FILE`) on every
  tick and submits `requestMarketGeneration` for any topic not
  already in the persistent `state/submitted-topics.<eoa>.json`
  (debounced atomic-rename writes, same v16 H3 pattern as the
  parse-failure cache). Bounded by `TOPIC_FEED_MAX_PER_TICK` (env,
  default 1) so a relayer coming up after a long downtime doesn't
  fire N requestMarketGeneration txs in one tick and exhaust the
  inference deposit budget. Closes the last "human in the loop"
  gap in the fully-autonomous pipeline (creation was
  human-triggered, now relayer-driven). H2 new
  `useMarketCreatedByRequestId` hook polls the `MarketCreatedByAgent`
  event matching a given requestId (using viem's typed-event
  `event: parseAbiItem(...)` + `args: {}` form, the pattern v27 L1
  hinted at); `GenerateMarketForm` auto-redirects to
  `/market/[id]` on success (router.replace, not push, so the back
  button takes the user to where they came from); `AgentReceiptViewer`
  shows a "View market #N" link badge in the "Agent Designed
  Market" panel. Both consumers flip `enabled: false` once the
  agent receipt is a terminal failure. L1 `useGenerationFailures`
  also scans `GenerationRequested` events in the same 5000-block
  window and builds a requestId→topic map (the contract's
  `requestToTopic` mapping is unconditionally deleted at the top
  of `handleGenerationCallback`, so the event is the only off-chain
  recovery source); the failure row in `AgentCommandCenter` now
  shows the original topic above the reason, truncated at 80 chars
  with a tooltip. 105/105 Foundry tests pass (no contract change).
- **v30 relayer+tooling** (this audit cycle) — H0 hoists the v29
  consts (`TOPICS_FILE`, `SUBMITTED_TOPICS_FILE`,
  `TOPIC_FEED_MAX_PER_TICK`) above the L148 startup `console.log`
  group in `scripts/relayer.mjs`. The v29 startup line referenced
  these consts but they were declared further down the file
  (L203 / L1107), so JS hit a TDZ ReferenceError and the relayer
  process exited before the main loop ever started — meaning v29
  H1's autonomous creation, v28 H1's drain-order swap, and every
  v8–v28 recovery behavior had been offline since v29 shipped.
  H1 reverses `drainTopicFeed`'s pre-flight/add order so the
  `topUp > maxWei` cap check runs BEFORE
  `submittedTopics.add(topic)` — pre-v30, a transient
  cap-exceedance or RPC blip would permanently add the topic to
  the persistent Set (operator had to hand-edit the JSON to
  recover). The verification gap is also closed: new
  `pnpm relayer:smoke` + `scripts/relayer-smoke.sh` forks the
  relayer with a populated env, waits 1.5s, and asserts the
  process is still alive. `pnpm lint` + `pnpm build` + `forge
  test` never execute the relayer — that's how v29's crash shipped
  silently. The smoke is the missing piece in the verification
  triangle. 105/105 Foundry tests pass (no contract change).
- **v31 relayer+manifest** (this audit cycle) — H0 makes
  `drainTopicFeed` wait for `publicClient.waitForTransactionReceipt`
  after `writeContract` and only add the topic to the persistent
  `submittedTopics` Set if `receipt.status === 'success'`. v30 H1
  had reordered the pre-flight/add/submit sequence but still
  trusted `writeContract`'s hash return as proof of submission —
  a contract-level `InsufficientContractBalance` revert (e.g.
  another actor draining the contract's STT balance in the same
  block) would refund the deposit to the relayer EOA but leave
  the topic in the Set, requiring a hand-edit of
  `state/submitted-topics.<eoa>.json` to recover. v31 closes the
  same theme as v30 H1: don't trust the relayer's local view of
  "this topic is done"; verify on-chain via the receipt. The 4
  other relayer paths (`tryResetStuckMarket`,
  `retryInferenceFromCache`, etc.) already follow the
  wait-for-receipt pattern; `drainTopicFeed` is brought into
  line. v31 also fixes the misleading v30 H1 comment that
  claimed "the deposit was forwarded to the platform" on a
  revert — that's only true for reverts that happen AFTER
  `PLATFORM.createRequest`, not for the pre-platform-call
  `InsufficientContractBalance` check that runs as the first
  thing in `requestMarketGeneration`. 105/105 Foundry tests
  pass (no contract change).
- **v32 relayer+manifest+frontend-polish** (this audit cycle) —
  H0 the manifest's `promptTemplate.system` field was
  semantically wrong when populated from the live contract —
  the contract has no system role, just a single user message
  of "<prefix><topic><suffix>". Renamed to `userSuffix` in both
  manifest route handlers and updated the static fallback in
  `lib-web/agentManifest.ts` to match the v7 SPECIFIC-URL +
  [300,600] SHORT-duration prompt text the live contract
  encodes (the old static was missing both requirements,
  matching the pre-v7 failure mode that blocked AI-created →
  AI-resolved markets). Also fixes the `onchainTools`
  description's `question <= 200 chars` → `question <= 500
  chars (MAX_QUESTION_LENGTH)` (200 is `MAX_TOPIC_LENGTH`, the
  proposer's topic — not the agent's designed question). H1
  `drainTopicFeed` Set-add now writes synchronously to disk
  instead of via the 5s-debounced `scheduleSubmittedTopicsSave`
  — the debounce was a SIGKILL race: a kill between the
  in-memory add and the disk flush would cause next boot to
  re-read the old file and re-submit the topic (burning a
  second ~0.3 STT inference deposit). Also removes the
  now-dead `scheduleSubmittedTopicsSave` function (ESLint
  `--max-warnings=0` caught it). L0 `waitForTransactionReceipt`
  in `drainTopicFeed` gets a 60s `timeout` so a stuck tx
  (dropped from mempool) can't block the main loop
  indefinitely. L2 proof page `contractVersionNote` now says
  "live on-chain is v15" so the live-vs-pending split is
  explicit. L3 receipt-by-tx route logs a warning when
  `NEXT_PUBLIC_CONTRACT_ADDRESS` is unset (the permissive
  filter is preserved, but the operator notices). L4 proof
  page "Seeded Markets" label hardcoded "Markets #3-#6" →
  "See live markets" (the actual count is environment-
  dependent). 105/105 Foundry tests pass (no contract change).
- **v33 relayer+frontend-polish** (this audit cycle) — H0
  `logResolvedMarkets` now uses a module-level
  `seenResolvedMarkets` Set (FIFO-capped at 1000, same
  pattern as the existing `seenGenerationFailures` Set at
  relayer.mjs:212) so a market that resolved at block N is
  logged once, not re-logged on every tick for the next 50
  blocks (~25 min at POLL_MS=30s) of duplicate "market N
  resolved outcome=YES" spam. H1 `MarketCard`\'s
  "View live receipt" link for markets in `Resolving` state
  now prefers `inferenceRequestId` over `parseRequestId` when
  both are > 0 — pre-v33, a market mid-inference linked to
  the (already-completed) parse receipt, so users missed the
  live inference. H2 `useMarketCreatedByRequestId`\'s
  `SCAN_WINDOW_BLOCKS` bumped 5000n → 50_000n (~50 min →
  ~8.3 hours on Shannon at ~600ms blocks). The window is
  recomputed from `head` on every poll, so an event at block
  N is permanently outside the window once `head > N + WINDOW`.
  50_000n covers slow LLM pipelines (60+ min) without missing
  the `MarketCreatedByAgent` event; the `args: { requestId }`
  indexed-arg filter keeps the RPC bandwidth bounded. H3
  `forceResetMarket` / `forceResetGeneration` now stash
  `(hash, kind, id)` tuples in a per-tx `Map` at `onSuccess`
  time so the success effect matches the right id to the
  right hash on rapid double-click — pre-v33, a single
  `recoveredMarketId` state was overwritten on every click,
  so the second click\'s marketId got invalidated on the first
  click\'s hash confirmation. M2 `seed-mock-markets.sh`
  `place_bet` helper now validates the amount ends in
  `ether` / `gwei` / `wei` (cast convention) so a future
  caller passing a bare number doesn\'t silently send wei-
  scale value and revert with `BetBelowMinimum`. L0
  `e2e-onchain.sh` drops the redundant 0.5 STT prefund at
  step [7/7] — the [1/7] prefund of 1 STT is enough to cover
  both the resolution (0.66 STT forwarded) and the two
  inference requests (0.33 STT each). L1+L2 `useAgentReceipt`
  branches on `err.status`: 404 ("not yet indexed") keeps
  polling at 5s and does NOT show the amber "taking longer
  than expected" banner (pre-v33, the single `status === 'error'
  → false` rule stopped polling entirely after `retry: 2` —
  ~10-15s of 404s — and the user had to click Refresh). 5xx
  keeps the original stop-polling + show-banner behavior.
- **v34 frontend+relayer+manifest** (this audit cycle) — H0 the
  proof page now shows the v7 E2E AI-created→AI-resolved proof
  run (market #3 on `0xd3E946aC…4B69`, parse `4254170`, inference
  `4254291`, resolution tx `0x362daa6f…b5143`) as a second
  "Historical Proof Run" section. CLAUDE.md has always advertised
  the v7 proof but the page was silent about it — judges who went
  straight to `/proof` missed the only on-chain evidence of the
  autonomous-creation pipeline (the headline capability of the
  project). H1 `useRpcHealth`'s first tick now returns `'pending'`
  (chain is responding, advancing is unknown) instead of `'ok'`.
  Pre-v34, the `lastBlockRef.current === null` short-circuit made
  the advancing check trivially true — a user loading `/proof`
  right when the chain had halted saw the green "ok" dot for ~30s.
  H2 `AgentReceiptViewer` branches on `upstreamStatus === 200`
  (the proxy returned 502 because `normalizeMinimalReceipt` threw)
  with a specific "we couldn't parse the response" message. Pre-v34,
  the malformed-body case fell through to the generic "Receipt not
  available yet" with no signal that the platform was actually
  responding. M1 the proof page's `contractVersion` and
  `contractVersionNote` strings are no longer hardcoded — the page
  is now an async server component that reads the contract's
  `agentManifest()` view at SSR time (5-min `unstable_cache` in
  `lib-web/agentManifestServer.ts`) and parses the `vN` prefix.
  Every contract deploy auto-updates the page. L0 added a
  `// HISTORICAL ANCHOR` comment block above the two `proofRun`
  consts so future maintainers know the contract addresses, market
  ids, and tx hashes are load-bearing. L1 `useRpcHealth` adds a
  `'stuck'` state — after 2 consecutive same-block ticks (~60s at
  `POLL_INTERVAL_MS=30s`), escalate `'slow'` → `'stuck'`. Operators
  can now tell "RPC up, chain halted" from "RPC slow" via the rose
  ping animation + the "Somnia chain stuck" tooltip copy. L2
  `statusLabel` in `lib-web/contract.ts` logs a dev-mode
  `console.warn` when the `MarketStatus` value isn't in the known
  set, so a future contract enum value can't ship without an
  explicit code change. 105/105 Foundry tests pass (no contract
  change).
- **v15–v18 contract (all share the v15 address — none deployed)** — the
  Foundry-tested sequence that adds the relayer + recovery pipeline
  (`forceResetMarket`, `scanStuckMarkets`, `STALE_REQUEST_TIMEOUT`,
  parse-failure URL LRU, exponential backoff, etc.) on top of v14's
  exact-byte YES/NO parser fix.

## Repo layout

```
src/                              Solidity sources (Foundry `src`)
  AutonomousPredictionMarket.sol  Main market + resolver contract
  AgentSmokeTest.sol              Throwaway inference-only smoke test
  interfaces/
    IAgentRequester.sol           Somnia Agent Platform interface (createRequest, getRequestDeposit, Response/Request/ResponseStatus)
    ILLMAgents.sol                LLM Parse Website + LLM Inference agent payload shapes

test/                             Foundry tests (`forge test -vv`)
  AutonomousPredictionMarket.t.sol 104 unit + fuzz + reentrancy tests with a mocked platform

script/                           Forge deploy scripts (`forge script …`)
  Deploy.s.sol                    Deploys market, prefunds 0.5 STT, seeds 2 demo markets
  AgentSmokeTest.s.sol            Deploys the smoke test caller

scripts/                          Shell + Node scripts (run with bash / node)
  deploy.sh                       Deploy via `forge create`, prefund 2 STT, seed markets, write NEXT_PUBLIC_CONTRACT_ADDRESS to .env, verify on explorer
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
  api/receipt/by-tx/[hash]/route.ts Decode GenerationRequested/ResolutionRequested event from a tx hash
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
  useGenerationFailures.ts        Polls the last 5000 blocks of GenerationFailed events for the recovery panel
  useRpcHealth.ts                 Polls block number; ok / slow / down classification

lib-web/                          Frontend-agnostic chain + contract glue
  contract.ts                     CONTRACT_ADDRESS, CONTRACT_ABI, Market/Bet types, formatting helpers
  somnia.ts                       Somnia testnet chain definition + wagmi/rainbowkit config (client)
  somnia-chain.ts                 Server-safe chain definition for route handlers
  agents.ts                       Somnia agent IDs, receipt URLs, receipt normalization, createMarket calldata decoder
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
- `MIN_DURATION = 300` seconds; `MAX_DURATION = 86400` (24h). Questions ≤ 500
  chars, sources ≤ 300 chars.
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
- `getGenerationPromptTemplate()` returns the prompt `(prefix, suffix)`
  constants so external agents can read the exact prompt without decompiling.
- `marketParseResult(uint256 marketId)` returns the cached parse string
  written by the v16 `marketParseResult` cache; `parseResultCached` is in
  the `AgentMarketContext` struct so external agents can decide whether to
  call `retryInferenceFromCache` from a single read.

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
forge test -vv                    # 104 tests in test/AutonomousPredictionMarket.t.sol

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

### `_parseYesNo` (v14)

Exact 2-byte `NO` (`'N','O'`) and 3-byte `YES` (`'Y','E','S'`) match —
anything else reopens the market. v9 introduced the exact-byte match but
flubbed the NO branch (it anchored at `length == 3`, a copy-paste from
the YES branch), so the platform's literal 2-byte `"NO"` response was
silently rejected. v14 splits the two literals and ships regression
tests for both branches.

## Deploying

```bash
./scripts/deploy.sh
# Equivalent manual flow:
#   forge build
#   forge create src/AutonomousPredictionMarket.sol:AutonomousPredictionMarket \
#     --rpc-url "$SHANNON_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast --legacy
#   cast send <contract> --value 2ether --rpc-url … --private-key … --legacy
#   cast send <contract> "createMarket(string,string,uint256)" "<q>" "<url>" 300 --rpc-url … --private-key … --legacy
```

`scripts/deploy.sh` will:

1. Run `forge build`.
2. Deploy via `forge create` (broadcast + legacy tx).
3. Prefund the contract with `2 STT` (covers the 0.66 STT total deposit for
   parse + inference per market, with headroom for a few sequential resolutions).
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
