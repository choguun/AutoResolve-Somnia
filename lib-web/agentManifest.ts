import { CONTRACT_ADDRESS } from './contract';
import {
  AGENTS_EXPLORER,
  LLM_INFERENCE_AGENT_ID,
  LLM_PARSE_WEBSITE_AGENT_ID,
  SHANNON_EXPLORER,
  SOMNIA_PLATFORM_ADDRESS,
} from './agents';

const SHANNON_CHAIN_ID = 50312;
const SHANNON_CHAIN_NAME = 'Somnia Shannon Testnet';
const SHANNON_RPC_URL = 'https://dream-rpc.somnia.network';

export function getAutoResolveAgentManifest() {
  return {
    name: 'AutoResolve',
    // v25 (H1): bumped from v22 → v24 to match the live frontend. The manifest
    // is served by the frontend, so the version label tracks the frontend. The
    // on-chain `agentManifest()` still returns "AutoResolve agent interface
    // v19." and is the authoritative source for the contract-side surface.
    // External agents should call both: the JSON manifest for the
    // frontend/UX version, and the on-chain view for the contract version.
    // The proof page reads this field as the single source of truth for its
    // "Frontend vN" pill (v24 H2 split the Frontend/Contract labels).
    // v29 (H1): bumped v24 → v29 to advertise the new relayer-driven topic
    // feed (drainTopicFeed) that closes the last "human in the loop" gap in
    // the fully-autonomous pipeline. Track the live frontend version in
    // lockstep with CLAUDE.md "Live app".
    // v30 (H0): bumped v29 → v30 — the v29 relayer was crashing on startup
    // with a TDZ ReferenceError (the startup console.log at L155 referenced
    // consts declared further down the file). v30 hoists the v29 consts
    // above the startup log group, and adds a `pnpm relayer:smoke` step
    // (scripts/relayer-smoke.sh) so future relayer-side crashes are caught
    // at verification time — `pnpm lint` + `pnpm build` + `forge test` never
    // execute the relayer, which is how v29's crash shipped silently.
    // v31 (H0): bumped v30 → v31 — drainTopicFeed now waits for the tx
    // receipt before adding the topic to the persistent submittedTopics
    // Set. v30 H1 had reordered pre-flight/add/submit but still trusted
    // writeContract's hash return as "submitted" — a contract-level
    // InsufficientContractBalance revert (e.g. another actor drained the
    // contract's STT balance in the same block) would refund the deposit
    // to the relayer EOA but leave the topic in the Set, requiring a
    // hand-edit of state/submitted-topics.<eoa>.json to recover. v31
    // closes the same theme as v30 H1: don't trust the relayer's local
    // view of "this topic is done"; verify on-chain via the receipt.
    // v33 (H0+H1+H2+H3): bumped v32 → v33 — four fixes.
    // H0: logResolvedMarkets now uses a module-level `seenResolvedMarkets` Set
    // (FIFO-capped at 1000) so a market that resolved at block N is logged
    // once, not 50 times. The 50-block scan window is recomputed every tick,
    // so without dedup a single resolution produced ~25 min of duplicate log
    // lines. Same pattern as the existing seenGenerationFailures Set.
    // H1: MarketCard's "View live receipt" link for markets in Resolving
    // state now prefers `inferenceRequestId` over `parseRequestId` when
    // both are > 0. Pre-v33, a market mid-inference linked to the
    // (already-completed) parse receipt, so users missed the live
    // inference.
    // H2: useMarketCreatedByRequestId's SCAN_WINDOW_BLOCKS bumped 5000n →
    // 50_000n (~50 min → ~8.3 hours on Shannon at 600ms blocks). The window
    // is recomputed from `head` every poll, so an event at block N is
    // permanently outside the window once `head > N + WINDOW`. 50_000n
    // covers slow LLM pipelines (60+ min) without missing the
    // MarketCreatedByAgent event. The `args: { requestId }` indexed-arg
    // filter keeps the RPC bandwidth bounded.
    // H3: forceResetMarket / forceResetGeneration now stash (hash, kind,
    // id) tuples in a Map at onSuccess time, so the success effect matches
    // the right id to the right hash on rapid double-click. Pre-v33, a
    // single `recoveredMarketId` state was overwritten on every click, so
    // the second click's marketId got invalidated on the first click's
    // hash confirmation.
    // v34 (H0+H1+H2+M1+L0+L1+L2): bumped v33 → v34 — three UX fixes,
    // one drift-hazard fix, two polish fixes, one dev-mode safety net.
    // H0: proof page now shows the v7 E2E AI-created→AI-resolved proof
    // run (market #3 on 0xd3E946aC…4B69, parse 4254170, inference
    // 4254291, resolution tx 0x362daa6f…b5143) as a second "Historical
    // Proof Run" section. CLAUDE.md advertises the v7 proof but the
    // page was silent about it — judges who went straight to /proof
    // missed the only on-chain evidence of the autonomous-creation
    // pipeline.
    // H1: useRpcHealth's first tick returns 'pending' (chain is
    // responding, advancing is unknown) instead of 'ok'. Pre-v34, the
    // `lastBlockRef.current === null` short-circuit made the advancing
    // check trivially true — a user loading /proof right when the
    // chain had halted saw the green 'ok' dot for ~30s.
    // H2: AgentReceiptViewer branches on `upstreamStatus === 200`
    // (proxy returned 502 because normalizeMinimalReceipt threw). Pre-
    // v34, the malformed-body case fell through to "Receipt not
    // available yet" with no signal that the platform was actually
    // responding. New branch surfaces a specific "we couldn't parse
    // the response" message.
    // M1: proof page's `contractVersion` and `contractVersionNote` are
    // no longer hardcoded. The page is now an async server component
    // that reads the contract's `agentManifest()` view at SSR time
    // (5-min unstable_cache in lib-web/agentManifestServer.ts) and
    // parses the `vN` prefix out of the body string. Every contract
    // deploy automatically updates the page — no manual string edit.
    // L0: added a `// HISTORICAL ANCHOR` comment block above the two
    // proofRun consts in app/proof/page.tsx so future maintainers know
    // the contract addresses, market ids, and tx hashes are load-
    // bearing (and not stale constants to update).
    // L1: useRpcHealth adds a 'stuck' state — after 2 consecutive
    // same-block ticks (~60s at POLL_INTERVAL_MS=30s), escalate
    // 'slow' → 'stuck'. Operators can now tell "RPC up, chain halted"
    // from "RPC slow" via the rose ping animation + the "Somnia chain
    // stuck" tooltip copy.
    // L2: statusLabel in lib-web/contract.ts logs a dev-mode
    // console.warn when status isn't in the known set, so a future
    // contract enum value can't ship without an explicit code change.
    // v35 (H0+H1+H2+M0+M1): bumped v34 → v35 — five polish fixes, no
    // contract change, no behavior change to the relayer main loop.
    // H0: useGenerationFailures's SCAN_WINDOW_BLOCKS bumped 5000n →
    // 50_000n. Symmetric with useMarketCreatedByRequestId (v33 H2) so
    // both hooks cover the same ~8.3-hour window. Pre-v35, a slow LLM
    // pipeline (60+ min) that eventually emitted a GenerationFailed
    // event could fall OUT of the failure panel's 5000-block window
    // even though the corresponding MarketCreatedByAgent event was
    // still in the auto-redirect hook's 50_000-block window — the
    // two hooks had asymmetric coverage, so the failure would
    // disappear from the recovery panel before the corresponding
    // market landed in the operator's UI.
    // H1: useAgentReceipt's MAX_POLL_MS constant renamed to
    // LONG_RUNNING_HINT_MS. The v27 cycle dropped the polling cap,
    // making the constant purely a UI threshold for the amber
    // "taking longer than expected" hint in AgentReceiptViewer —
    // polling continues until the receipt completes or errors. The
    // old name was misleading: it sounded like a polling budget,
    // which it isn't anymore.
    // H2: the same hook's startedAt moves from useState(() => Date.now())
    // to useRef + useEffect keyed on id. Pre-v35, the wall clock was
    // captured at hook MOUNT, not on requestId change — a
    // /receipt/[requestId] page that mounted the hook once and then
    // changed the requestId would show the long-running hint timed
    // from the FIRST requestId's fetch start. The hint is now
    // anchored to the current requestId's first fetch.
    // M0: /api/topics adds Cache-Control: public, max-age=5. The
    // topic list is operator-edited and safe to cache for 5s;
    // without the header, every AgentCommandCenter + relayer fetch
    // hit the disk and Next.js's default `private, no-cache` policy
    // made the route a serialization hot spot under load.
    // M1: AgentCommandCenter's "last ~50 min" chip + empty-state
    // copy updated to "last ~8 hours" to match H0.
    // v36 (H0+M0+L0+L1): bumped v35 → v36 — four polish fixes, no
    // contract change, no relayer main-loop behavior change.
    // H0: relayer's urlKey hashes the FULL normalized URL. v15
    // dropped the path via split('/').slice(0, 3), so the key for
    // https://en.wikipedia.org/wiki/Paris was hash('https://en.wikipedia.org')
    // — a single parse failure on ANY path on that host added that
    // hash to the parse-failure LRU, and every subsequent Wikipedia
    // market (and any other host sharing the same scheme+host) was
    // silently skipped by isUrlInParseFailureCache for
    // PARSE_FAILURE_TTL_MS (1h). The v15 comment claimed "the path
    // is case-sensitive in the LLM parsing sense, so we leave the
    // path alone" but the implementation contradicted it. djb2 body
    // unchanged; only the input string is different.
    // M0: relayer's cap-exceedance log (drainTopicFeed topUp >
    // maxWei branch) now uses the same conditional-ellipsis
    // pattern as the success/reverted logs at the same depth
    // (`${topic.slice(0, 40)}${topic.length > 40 ? '…' : ''}`).
    // Pre-v36, the cap-exceedance line always emitted a trailing
    // "…" character, even for short topics — pure copy
    // inconsistency with the sibling logs.
    // L0: /api/receipt/by-tx/[hash] surfaces `contractFilterApplied`
    // (boolean) in the JSON response — false when
    // NEXT_PUBLIC_CONTRACT_ADDRESS is unset, so the contract-
    // address log filter at L75 is bypassed. GenerateMarketForm
    // reads the flag and shows a one-time warning toast (gated by
    // a useRef so it fires at most once per page lifetime). The
    // server-side console.warn stays in place for operators; the
    // toast covers users who navigate via the explorer deep link
    // and never see dev-server logs.
    // L1: useAgentReceipt caps 404 polling at LONG_RUNNING_HINT_MS.
    // v33 L1 switched the 404 path from "stop polling entirely" to
    // "keep polling at 5s", which was the right fix for a slow-to-
    // index receipt — but a receipt that stays in 404 for hours
    // (stale link, dead requestId) was burning a 5s poll + server
    // round-trip forever. The hook now tracks firstNotFoundAt in a
    // ref, stops polling after LONG_RUNNING_HINT_MS of consecutive
    // 404s, and exposes `hasGivenUpOn404` to the UI. AgentReceiptViewer
    // swaps the "stale link" copy for a "we've stopped polling"
    // message in the give-up branch. The ref resets on success, on
    // id change, and on a manual refetch (the wrapped `refetch`).
    // v37 (H0+M0): bumped v36 → v37 — one correctness fix, one perf
    // fix, no contract change, no relayer main-loop behavior change.
    // H0: relayer's logResolvedMarkets now decodes the outcome from
    // log.data, not log.topics[2]. The contract event
    // `MarketResolved(uint256 indexed marketId, bool outcome, string
    // reason, uint256 timestamp)` only has marketId indexed, so
    // log.topics[2] was undefined and BigInt(undefined) threw on
    // every resolved market. The throw was caught by the main loop's
    // try/catch (kept the relayer alive) but suppressed the
    // operator's primary signal that the autonomous pipeline
    // actually completed — operators saw `[relayer] loop error: ...`
    // instead of the `market N resolved outcome=YES` log line. Same
    // decodeAbiParameters pattern as drainFailureEvents (L684) and
    // drainGenerationFailureEvents (L1093).
    // M0: useMarkets parallelizes the 9 getMarket reads per page
    // with Promise.all. Pre-v37, a for-loop awaited each read
    // sequentially — at Shannon RPC's 200-500ms/read latency, a full
    // page took 1.8-4.5s to land. Post-v37, the page collapses to a
    // single round-trip latency window (~500ms, the slowest of the
    // 9 reads). Same pattern as useMyBets (L165) and
    // useUserBets (L228). Promise.all preserves input order, so
    // the highest-id-first page walk is identical to the pre-v37
    // sequential path.
    // v38 (H0+M0): bumped v37 → v38 — two correctness fixes, no
    // contract change, no relayer change.
    // H0: ResolutionPanel's ResolutionRequested log decode — the
    // contract event has ONLY marketId indexed, but the panel
    // read `log.topics[2]` for the requestId and a `!log.topics[2]`
    // guard at L51 made the bug SILENT — every log was skipped, so
    // the "Watch live parse receipt" deep link never rendered for
    // any resolution. Same decodeAbiParameters pattern as the v37
    // H0 logResolvedMarkets fix and useGenerationFailures:104. The
    // docstring above the decode (the v19 L1 comment) was also
    // wrong — it claimed requestId was indexed, but it isn't.
    // M0: /api/receipt/by-tx/[hash] had the same bug for the
    // ResolutionRequested branch — only marketId is indexed, but
    // the route read `log.topics[2]` for requestId. A null-guard
    // at L90 prevented a throw but silently dropped the resolution
    // requestId from mixed txs (e.g. seed-mock-markets.sh or a
    // relayer batch). The pure-GenerationRequested path (the
    // common case for GenerateMarketForm) was unaffected. Same
    // decodeAbiParameters pattern as H0.
    // v40 (L0): bumped v38 → v40 — one contract change (per-user
    // market enumeration for the My Bets tab), no relayer change.
    // Adds getUserMarkets(address) → uint256[] and the
    // userMarketIds[user] / _userMarketIndex[user][marketId]
    // storage pair (manual EnumerableSet pattern). bet() pushes
    // (msg.sender, marketId) into the set on first bet; the
    // frontend's useMyBets calls getUserMarkets to enumerate the
    // user's markets in O(K) and reads positions for just those
    // markets. The pre-v40 O(N) tab-switch trigger in app/page.tsx
    // and the useMyBetsMarkets filter loop are gone. claimWinnings
    // does NOT remove from the set — the array tracks "user has
    // bet on this market at some point" and the frontend reads
    // yes/no amounts to distinguish active from history. The 3
    // pre-existing Inference*Cache tests were updated to use the
    // new storage slot (12 → 14) since the two new mappings
    // shifted marketParseResult's slot.
    // v48 (M1): bump v40 → v47. The on-chain agentManifest() string was
    // bumped v19 → v40 in v45 (M1), so the /proof "Contract vN" pill is
    // authoritative for the contract-side. This file is the frontend-
    // shipped manifest and the /proof "Frontend vN" pill (v23 H2). The
    // gap from v40 → v47 is the relayer + frontend + tooling hardening
    // that doesn't change the on-chain ABI: v45 L1 relayer startup banner
    // + smoke grep; v45 L2 deploy.sh prefund comment typo; v45 L3
    // Dockerfile dead duplicate COPY; v45 L4 proof page regex patch-
    // bump support; v46 L1+L2 CreateMarketForm + ResolutionPanel cache
    // v55 (M1): post-deploy comment refresh. The v40 baseline came
    // from the v45 on-chain string bump (M1) — the last ABI-affecting
    // cycle. v45-v47 added portable deploy.sh + AgentCommandCenter
    // pendingInvoke Map + /api/topics console.warn + DEPLOYED.md
    // "Next deploy" callout; v48 (M1) bumped the field v40 -> v47
    // to track them. v49 (docs sweep) + v50 (DEPLOYED body changelog
    // + judgingAlignment sentence + useQueryClient import fix) shipped
    // additional frontend surface without a corresponding bump; v51
    // (M1) bumped v47 -> v50 to close the gap. v55 (M1) does NOT
    // change the field value — the post-deploy public-doc sweep
    // (README/DEPLOYED/PITCH_DECK/CLAUDE.md, /proof Tooltip, this
    // comment) is purely a documentation refresh that doesn't touch
    // the surface the field describes. v56 (H0) bumped the field
    // v50 -> v56 to advertise the new Daily Resolution Demo section
    // on /proof (one AI-created market per day, 24h duration, fully
    // autonomous resolution) + the new /api/daily-topic endpoint +
    // the new scripts/daily-topics.txt operator-curated feed. v57
    // (H0) bumped v56 -> v57 to advertise the live-ticking
    // LiveCountdown component (components/shared/LiveCountdown.tsx)
    // shared by MarketCard and MarketHeader — replaces the static
    // formatCountdown call with a 1Hz client tick that color-shifts
    // cyan → amber → pulsing amber as the resolution window closes.
    // v58 (H0) bumps v57 -> v58 to advertise the home-page tab
    // rename: the old "Resolved" tab is now "Ended" and matches
    // any market whose endTime has passed (status can be Open
    // for markets that hit endTime but haven't been pushed to
    // Resolving yet, or Resolved for markets with a final outcome).
    // v58 also seeds 4 fresh active markets with 1h/6h/24h
    // durations on the v19+v40+v45 contract so the Active tab
    // is non-empty. v59 (H0) bumps v58 -> v59 to advertise
    // the daily auto-creation pattern: scripts/daily-topics.txt
    // now has two `{{date}}`-templated lines (Ethereum gas +
    // Bitcoin price) that the relayer's drainTopicFeed and the
    // /api/daily-topic route both substitute at read time with
    // today's UTC date. The substitution is what makes the
    // relayer's submittedTopics Set dedup-by-string actually
    // re-fire daily — a static line would only fire once total.
    // v59 also creates market #12 with the corrected Bitcoin
    // question to fix the v58 bash-quoting bug (the prior
    // market #9 had the `$110,000` literally eaten by $1
    // variable interpolation). v60 (H0) bumps the field
    // v59 -> v60 to advertise the on-chain prompt-suffix
    // change: the new suffix teaches the inference agent to
    // honor the [duration=N] suffix in topic text instead of
    // preferring [300, 600] seconds, so the daily
    // auto-create pattern produces 24h markets (matching the
    // user's [duration=86400] hint) instead of the pre-v60
    // 5-min markets that expired before judges could
    // interact. The shipped invariant is Contract (on-chain
    // agentManifest) = v40, Frontend (this field) = v60.
    // v60 is a contract change (compiled bytecode shifts) but
    // does NOT change the on-chain agentManifest() string,
    // which is a static narrative that doesn't reference the
    // prompt suffix — so the v40 label is still accurate.
    // v61 (H0) bumps the field v60 -> v61 to advertise the
    // bet-flow UX fix: lowered the default bet amount from
    // 0.01 to 0.001 STT (= MIN_BET) and added a useEffect
    // that surfaces the full writeContract error in a toast
    // with a specific "top up your STT balance" hint when
    // the error looks like a gas/balance issue. The pre-v61
    // behavior did `err.message.slice(0, 120)` in onError,
    // which truncated the wallet's shortMessage and lost the
    // distinction between a gas issue, a user-rejected tx, and
    // a contract revert. v61 is a frontend-only change (no
    // contract bytecode shift).
    // v62 (M0) bumps v61 -> v62 to advertise the relayer-driven
    // auto-liquidity feature: when RELAYER_LIQUIDITY_STT > 0
    // (default 0 = disabled), the relayer EOA places a small
    // YES+NO seed bet on every newly-created market and auto-
    // claims the winnings on MarketResolved. The seed is
    // invisible in the UI (it just bumps yesTotal/noTotal) and
    // uses the existing bet() / claimWinnings() entry points —
    // no contract bytecode shift, no new functions. A future
    // v2 AMM LP slot is reserved in the manifest below.
    // v63 (H1+M1+M2+L1) bumps v62 -> v63 to advertise the v62
    // audit cleanup: stranded-seed observability (logs the locked
    // STT when a seeded market's URL is in the parse-failure LRU
    // and detects LRU eviction so the seed can be recovered),
    // dynamic MIN_BET (reads from the contract on startup instead
    // of a hardcoded 0.001 STT), partial-seed completion (avoids
    // double-betting on a YES+NO pair when a prior attempt placed
    // one side before failing), and the env-toggle foot-gun fix
    // (the claim block no longer skips when the operator toggles
    // RELAYER_LIQUIDITY_STT to '0' mid-flight). No contract
    // bytecode change.
    // v64 (M0+L1) bumps v63 -> v64 to advertise the dApp surface
    // for the stranded-seed observability: the /api/stranded-seeds
    // API route derives the stranded set from on-chain data
    // (getUserMarkets + getMarket + getMarketBets), and a new
    // StrandedSeedsCard on /proof renders the list with count +
    // total STT locked. The v64 re-resolving log line fix replaces
    // the misleading "re-resolving" message with "parse-failure
    // cached; next scan will retry once LRU evicts URL" for the
    // parse-failure case. No contract bytecode change.
    // v65 (H0+L1) bumps v64 -> v65 to advertise the v64-audit
    // cleanup: backfill-on-startup pass that scans [1, nextMarketId)
    // for any Open market where the relayer EOA hasn't already
    // placed the YES+NO seed (catches markets created before the
    // v62 auto-seed feature was enabled; on the live contract, 8
    // markets were missed by the initial-cursor-skip pattern and
    // sat unseeded). Idempotent, runs once per process, gates on
    // the in-memory hasBackfilled flag. Also: the StrandedSeedsCard
    // now uses a precision-preserving STT-string-to-wei helper
    // (sttStringToWei) instead of `Number * 1e18` which loses
    // precision for STT amounts > ~9 STT. No contract bytecode
    // change.
    // v66 (M0+L1) bumps v65 -> v66 to advertise the v65-audit
    // cleanup: periodic partial-seed retry that runs every
    // RELAYER_RETRY_PARTIAL_SEED_INTERVAL_TICKS (default 60 = ~30
    // minutes) and scans the seededMarkets Set for any market
    // where the relayer EOA lacks both YES+NO bets, re-attempting
    // the missing side. This is the operator-friendly recovery for
    // the Somnia state-trie partial-seed bug (a successful tx
    // that doesn't commit `market.noTotal` even though the relayer
    // EOA's userNoBets and the marketBets array are both updated).
    // Also: the stranded-seeds route now tags each entry with a
    // `partialSeed` boolean so the dApp can show a "partial" pill
    // on the StrandedSeedsCard table. No contract bytecode change.
    // v67 (L0+L1+L2) bumps v66 -> v67 to advertise the v66-audit
    // cleanup: (L0) the stranded-seeds route now requires the
    // relayer EOA to have userYesBets AND userNoBets of EXACTLY
    // 0.01 STT each (the auto-seed size) — this excludes test
    // markets where the relayer EOA has bets with arbitrary
    // amounts (e.g. market #3 from the v62 gas test) from the
    // stranded count. (L1) the sttStringToWei precision helper
    // is moved from the dApp to lib-web/contract.ts so the API
    // route can also use it. (L2) the partial-seed retry now
    // happens on EVERY tick (not just every 30 min) for markets
    // in the flaggedPartials Map — the operator sees a
    // "partial" pill for the minimum possible window. The
    // slow-path full scan still runs every
    // RETRY_PARTIAL_SEED_INTERVAL_TICKS. Markets that remain
    // partial for 60 attempts (30 min) are dropped with an
    // advisory log. No contract bytecode change.
    // v68 (M0) bumps v67 -> v68 to advertise the relayer-driven
    // auto-funding feature. The relayer now tops up the contract's
    // STT balance whenever it falls below RELAYER_AUTO_FUND_STT
    // (a new env var, default 0 = disabled). The refill is
    // bounded by min(0.1 * relayerEOABalance,
    // RELAYER_AUTO_FUND_MAX_PER_REFILL_STT default 2 STT) so a
    // single tick can't blow the operator's wallet. No contract
    // bytecode change — the contract's receive() function at L982
    // already accepts plain STT transfers, and the view functions
    // at L467/L1022 already return the funding status.
    version: 'v68',
    description:
      'Fully autonomous prediction market on Somnia: markets are created and resolved by validator-executed Somnia AI agents (LLM Parse Website + LLM Inference).',
    chain: {
      id: SHANNON_CHAIN_ID,
      name: SHANNON_CHAIN_NAME,
      rpcUrl: SHANNON_RPC_URL,
      explorer: SHANNON_EXPLORER,
    },
    contract: {
      address: CONTRACT_ADDRESS,
      explorerUrl: `${SHANNON_EXPLORER}/address/${CONTRACT_ADDRESS}`,
      platform: SOMNIA_PLATFORM_ADDRESS,
    },
    agents: {
      parseWebsite: {
        id: LLM_PARSE_WEBSITE_AGENT_ID,
        purpose: 'Extract factual evidence from a market resolution source URL.',
      },
      inference: {
        id: LLM_INFERENCE_AGENT_ID,
        purpose:
          'Multi-function LLM: inferString for constrained YES/NO classification, inferToolsChat for on-chain tool calling (creates markets).',
      },
      explorer: AGENTS_EXPLORER,
    },
    autonomousInterface: {
      discover: 'scanResolvableMarkets(uint256 cursor,uint256 limit)',
      discoverCreated: 'scanAgentCreatedMarkets(uint256 cursor,uint256 limit)',
      discoverStuck: 'scanStuckMarkets(uint256 cursor,uint256 limit)',
      discoverStuckGeneration: 'scanStuckGenerationRequests(uint256 cursor,uint256 limit)',
      // v40 (L0): per-user market enumeration. External agents and
      // dashboards can call this to list a user's positions in O(K)
      // where K = the user's position count. Used by the frontend's
      // My Bets tab to replace the O(N) "load every market page and
      // check each for a position" with a single targeted read. The
      // array tracks "user has bet on this market at some point" —
      // after a claim, the amounts are zeroed but the market id
      // stays. Frontends read userYesBets/userNoBets to distinguish
      // active positions from history.
      discoverUser: 'getUserMarkets(address user) returns (uint256[])',
      recover: 'forceResetMarket(uint256 marketId)',
      recoverGeneration: 'forceResetGeneration(uint256 requestId)',
      // v16: cache-aware inference resume. When the parse callback succeeded
      // but the contract was underfunded for the inference call, the contract
      // caches the parse result and emits InferenceUnderfunded. External
      // agents can call this to skip the re-parse and pay only the inference
      // deposit. The relayer is the primary caller; this is documented for
      // other watchtowers.
      retryFromCache: 'retryInferenceFromCache(uint256 marketId) payable',
      inspect: 'getAgentMarketContext(uint256 marketId)',
      invoke: 'requestResolution(uint256 marketId) payable',
      invokeCreation: 'requestMarketGeneration(string topic) payable returns (uint256 requestId)',
      funding: 'getResolutionFundingStatus()',
      fundingCreation: 'getGenerationFundingStatus()',
      manifest: 'agentManifest()',
    },
    creation: {
      agentId: LLM_INFERENCE_AGENT_ID,
      function: 'inferToolsChat',
      trigger: 'requestMarketGeneration(string topic) payable',
      funding: 'getGenerationFundingStatus()',
      discover: 'scanAgentCreatedMarkets(uint256 cursor,uint256 limit)',
      onchainTools: [
        {
          signature: 'createMarket(string,string,uint256)',
          description:
            'Create a binary YES/NO market. question <= 500 chars (MAX_QUESTION_LENGTH), source is http(s) URL, durationSeconds in [300, 86400] (MIN_DURATION..MAX_DURATION; honor the [duration=N] suffix in the topic text if present, otherwise pick a per-topic-appropriate value in [300, 86400]). Returns the new marketId.',
        },
      ],
      // v25 (L3): the prompt template is no longer hardcoded. The route
      // handlers (/api/agent-manifest, /.well-known/autoresolve-agent.json)
      // merge `getGenerationPromptTemplate()` into this object at response
      // time, so the manifest reflects the on-chain source-of-truth. If the
      // contract is unreachable the field is omitted rather than guessed.
      // The static `userPrefix` string is kept as a fallback for the proof
      // page (which renders a static description) — see CLAUDE.md note:
      // these are documentation, not the live prompt.
      // v32 (H0): the live contract sends a SINGLE user message of
      // "<prefix><topic><suffix>" — there is no system role. The previous
      // static fallback labeled a non-existent `system` field, which would
      // mislead external agents. Renamed to `userSuffix` to match the
      // actual model architecture; the text is the v7 SPECIFIC-URL +
      // honor-the-duration-hint guidance the live contract prompt
      // encodes (the older static text was missing both requirements,
      // which is what blocked AI-created → AI-resolved markets until
      // v7, and v60 fixed the duration-hint honor so the daily
      // auto-create pattern produces 24h markets instead of 5-min).
      promptTemplate: {
        userPrefix: 'Design a binary YES/NO prediction market on this topic. ',
        userSuffix:
          ' You MUST call createMarket(question, source, durationSeconds) exactly once. ' +
          'question <= 500 chars. The source URL MUST be a SPECIFIC article or page that directly states the answer to the YES/NO question (e.g. https://en.wikipedia.org/wiki/Paris NOT https://en.wikipedia.org/). ' +
          "DURATION: if the topic text includes a [duration=N] suffix, use that exact value in seconds. Otherwise pick a duration appropriate for the topic in [300, 86400] seconds (daily / 'this week' / 'tomorrow' topics should use 86400; same-day 'by end of today' topics should use 43200-86400; 'did X already happen' topics should use 300-3600).",
      },
      creatorSentinel: '0x00000000000000000000000000000000000000A1',
      // v56 (H0): the daily-cadence autonomous-creation pattern. The
      // /proof page renders a DailyResolutionDemo section that calls
      // requestMarketGeneration with a curated topic from
      // scripts/daily-topics.txt (rotated by dayOfYear % topics.length)
      // and a [duration=N] suffix that hints the agent at a specific
      // endTime. The /api/daily-topic endpoint is the topic-feed; the
      // panel tracks Submitted → Created → Resolving → Resolved over
      // the 24h market lifetime. This is documentation only — no
      // contract change, no relayer change.
      dailyResolution: {
        description:
          'Operator-curated topic rotation: one autonomous market per day, 24h duration by default. ' +
          'Topics sourced from scripts/daily-topics.txt (one line per day, [duration=N] suffix supported); ' +
          "the /api/daily-topic endpoint returns today's topic as topics[dayOfYear_utc % topics.length].",
        topicFeed: '/api/daily-topic',
        topicFile: 'scripts/daily-topics.txt',
        durationHintConvention: '[duration=<seconds>] suffix in topic text',
        demo: 'DailyResolutionDemo section on /proof',
      },
      // v62 (M0): relayer-driven auto-liquidity. Opt-in via
      // RELAYER_LIQUIDITY_STT (default 0 = disabled). When enabled,
      // the relayer EOA places a small YES+NO seed bet on every
      // newly-created market (capped at RELAYER_SEED_MAX_PER_TICK per
      // tick) and auto-claims the winnings on MarketResolved. The
      // seed lands in marketBets[id] like any other bet, so the UI
      // just sees the bumped yesTotal/noTotal — no new component, no
      // new copy. Future v2 will introduce a real on-chain AMM LP
      // (addLiquidity/removeLiquidity) — the contract surface is
      // reserved here but not implemented in v62.
      autoLiquidity: {
        description:
          'Relayer-driven auto-liquidity. When RELAYER_LIQUIDITY_STT > 0 ' +
          '(default 0 = disabled for first-deploy safety), the relayer EOA ' +
          'places a YES+NO seed bet of that amount on every newly-created ' +
          'market, and auto-claims the winnings back on MarketResolved. ' +
          'Pure relayer logic — uses the existing bet() and claimWinnings() ' +
          'entry points; no contract bytecode change.',
        enabled: 'env-gated: RELAYER_LIQUIDITY_STT > 0',
        seedAmount: 'RELAYER_LIQUIDITY_STT STT per side (total = 2x per market)',
        seedTrigger: 'MarketCreated event (drainSeedEvents in scripts/relayer.mjs)',
        claimTrigger: 'MarketResolved event (augmented logResolvedMarkets in scripts/relayer.mjs)',
        perTickCap: 'RELAYER_SEED_MAX_PER_TICK (default 5) bounds burst case',
        stateFiles: [
          'state/seeded-markets.<eoa>.json (cross-restart dedup for the seed bet)',
          'state/claimed-markets.<eoa>.json (FIFO-capped at 1000, in-memory + persistence)',
        ],
        v2AMM: 'AMM constant-product LP (addLiquidity/removeLiquidity) reserved, not yet implemented',
      },
    },
    judgingAlignment: {
      functionality:
        'Deployed contract supports create (manual + AI), bet, resolve, receipt review, and claim flows. End-to-end autonomous generation is wired through the live LLM Inference agent.',
      agentFirstDesign:
        'Both market creation and resolution are driven by validator-executed Somnia agents. Creation uses LLM Inference inferToolsChat (on-chain tool calling) — the model returns ABI-encoded createMarket calldata that the contract validates and executes.',
      innovation:
        'A generalizable primitive: a permissionless contract whose end-to-end lifecycle (create -> bet -> resolve -> claim) is executable by an external agent without frontend or admin keys.',
      autonomousPerformance:
        'Both creation and resolution run without frontend state. Any external agent can call getGenerationFundingStatus, requestMarketGeneration, scanAgentCreatedMarkets, getResolutionFundingStatus, scanResolvableMarkets, and requestResolution in sequence. v29 ships a topic-feed relayer (scripts/relayer.mjs drainTopicFeed) that closes the last human-in-the-loop gap: it reads scripts/topics.txt (or $GENERATION_TOPICS_FILE) on every tick and submits requestMarketGeneration for any topic not already in state/submitted-topics.<eoa>.json. v30 hoists the v29 consts above the startup console.log group (the v29 startup crashed with a TDZ ReferenceError — the relayer was offline) and adds pnpm relayer:smoke as the missing piece in the verification triangle, since `pnpm lint` + `pnpm build` + `forge test` never execute the relayer. v31 makes drainTopicFeed wait for the tx receipt before adding the topic to the persistent Set, closing a residual of v30 H1: a contract-level InsufficientContractBalance revert (e.g. another actor draining the contract balance in the same block) used to refund the deposit to the relayer EOA while leaving the topic in submitted-topics.json, requiring a hand-edit to recover. v32 makes the Set-add write synchronously to disk (closing a SIGKILL race that would re-submit on next boot) and renames the manifest `promptTemplate.system` field to `userSuffix` because the contract sends a single user message of "<prefix><topic><suffix>" — there is no system role. v33 adds a `seenResolvedMarkets` Set so each resolution is logged once (not 50 times over the 50-block scan window), widens the MarketCreatedByAgent scan window to 50_000n so slow LLM pipelines (60+ min) still surface the new marketId to the frontend, fixes MarketCard\'s "View live receipt" link to prefer the inference receipt over the parse receipt when both exist, and tracks forceResetMarket/forceResetGeneration targets in a per-tx Map so rapid double-clicks invalidate the right /market/[id] query. v34 adds the v7 E2E AI-created→AI-resolved proof run to /proof (market #3 on 0xd3E946aC…4B69 — the only on-chain evidence of the autonomous-creation pipeline; pre-v34 the page was silent about it despite CLAUDE.md advertising it), reads the live contractVersion from agentManifest() at SSR time (5-min unstable_cache) so the page self-updates on every deploy — no more manual "v19 (pending) / live on-chain is v15" string edits — and teaches useRpcHealth about a "pending" first-tick state and a "stuck" state (2 consecutive same-block ticks) so operators can tell "chain halted" from "chain slow but alive" and the green dot doesn\'t flash "ok" for one tick on a halted chain. v35 bumps useGenerationFailures\'s SCAN_WINDOW_BLOCKS to 50_000n (symmetric with useMarketCreatedByRequestId) so the failure panel covers the same ~8.3 hours as the auto-redirect window, fixes useAgentReceipt\'s startedAt (now useRef+useEffect keyed on id) so the amber long-running hint is anchored to the current requestId\'s first fetch (not the hook mount), and caches /api/topics for 5s so the topic feed stops being a disk-read hot spot. v36 fixes the relayer\'s urlKey (v15 was dropping the path via split.slice(0,3), so a single parse failure on any Wikipedia URL would block every Wikipedia-based market via the parse-failure LRU for an hour), aligns the cap-exceedance log\'s unconditional-ellipsis quirk with the sibling success/reverted logs\'s conditional-ellipsis pattern, surfaces the by-tx endpoint\'s contract-filter bypass as a boolean the form can toast (so users navigating via the explorer deep link see the same warning operators see in dev-server logs), and caps useAgentReceipt\'s 404 polling at LONG_RUNNING_HINT_MS (a stale or dead requestId was burning a 5s poll + server round-trip forever after v33 L1 enabled persistent 404 polling — now stops after 5 min of consecutive 404s with a Refresh button to resume from a clean slate). v37 fixes the relayer\'s logResolvedMarkets outcome decode — BigInt(log.topics[2]) was throwing on every resolved market because MarketResolved only has marketId indexed (pre-v37 the throw was caught by the main-loop try/catch and operators saw `[relayer] loop error:` instead of the `market N resolved outcome=YES` line that signals the autonomous pipeline closed) — and parallelizes useMarkets\'s 9 getMarket reads per page with Promise.all, collapsing 1.8-4.5s of sequential RPC round-trips into a single round-trip latency window (~500ms). v38 fixes two consumers of the ResolutionRequested event — the contract has only marketId indexed, but ResolutionPanel\'s `if (!log.topics[2]) continue;` guard (L51) made the requestId-extraction bug silent (the "Watch live parse receipt" deep link never rendered for any resolution) and /api/receipt/by-tx/[hash]\'s L90 null-guard dropped the resolution requestId from mixed txs without throwing. Both now decode requestId from log.data via decodeAbiParameters, matching the v37 H0 pattern. v40 adds getUserMarkets(address) → uint256[] and the userMarketIds[user] / _userMarketIndex[user][marketId] storage pair (manual EnumerableSet pattern) so the My Bets tab can enumerate a user\'s positions in O(K) where K = the user\'s position count. bet() pushes (msg.sender, marketId) into the set on first bet; the frontend\'s useMyBets calls getUserMarkets to enumerate the user\'s markets and reads positions for just those markets. claimWinnings does NOT remove from the set — the array tracks "user has bet on this market at some point" and the frontend reads yes/no amounts to distinguish active from history. The pre-v40 O(N) tab-switch trigger in app/page.tsx and the useMyBetsMarkets filter loop are gone. v45 bumps the on-chain agentManifest() string v19 → v40 (the user-position-discovery surface is live but the on-chain string would have still said v19 after deploy, so the /proof Contract vN pill would have advertised a stale version while exposing v40 ABI) and adds queryClient.invalidateQueries to BetPanel (mirrors the v19 H2 / v43 L1 PayoutClaim pattern — pre-v45 the My Bets tab was stale for 10s after a bet). v46 mirrors the same cache-invalidation pattern for CreateMarketForm + ResolutionPanel (pre-v46 the just-created market didn\'t appear on / for the full 10s useMarkets refetchInterval, and a confused user could double-click Request Resolution in the 5s stale window and burn a second STT top-up that reverted MarketNotOpen). v47 makes scripts/deploy.sh portable to GNU sed (the pre-v47 BSD-sed `sed -i ""` aborted with `sed: -i may not be used with stdin` on Linux / CI / Vercel runner under set -euo pipefail — the contract would have deployed but .env would never have been updated, stranding the frontend on the placeholder 0x0000…0000) and adds a per-tx (id → hash) Map to AgentCommandCenter for requestResolution + requestMarketGeneration, mirroring the v33 H3 forceReset pattern (pre-v47 a judge double-clicking Invoke Resolver on market #1 then #2 saw the same generic toast for whichever hash confirmed first and burned a second STT top-up). v48 bumps the manifest\'s version field v40 → v47 (the on-chain string bump v19 → v40 in v45 M1 plus the shipped frontend surface in v45–v47 — deploy.sh portability, AgentCommandCenter pendingInvoke Map, /api/topics console.warn, DEPLOYED.md Next deploy callout — had been silently leaving the Frontend vN pill one cycle behind), adds a `value=${formatEther(topUp)} STT` annotation to the drainTopicFeed catch log (operators can now tell top-up-needed-exceeds-cap from RPC-rejecting-writes without cross-referencing getGenerationFundingStatus manually), a conditional empty-state log to drainTopicFeed (closes the silent-return pattern that hid the v29 TDZ bug for VERBOSE=1 operators), and a queryClient.invalidateQueries([\'nextMarketId\'], [\'markets\']) call to the GenerateMarketForm auto-redirect useEffect (a user who hits Back from the auto-redirect sees the just-created market instead of waiting 10s for the next useMarkets tick).',
    },
    proofRun: {
      contractAddress: '0x1631303A748076648a0AbbE077a657Ad7812834F',
      marketId: '1',
      parseRequestId: '2400421',
      inferenceRequestId: '2400485',
      outcome: 'YES',
    },
    latestDeployment: {
      contractAddress: CONTRACT_ADDRESS,
      seededMarkets: ['1', '2'],
      agentDiscoverable: true,
      supportsAutonomousCreation: true,
    },
  };
}
