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
    version: 'v40',
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
            'Create a binary YES/NO market. question <= 500 chars (MAX_QUESTION_LENGTH), source is http(s) URL, durationSeconds in [300, 86400] (MIN_DURATION..MAX_DURATION; prefer [300, 600] for fast resolution). Returns the new marketId.',
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
      // SHORT-duration guidance the live contract prompt encodes (the
      // older static text was missing both requirements, which is what
      // blocked AI-created → AI-resolved markets until v7).
      promptTemplate: {
        userPrefix: 'Design a binary YES/NO prediction market on this topic. ',
        userSuffix:
          ' You MUST call createMarket(question, source, durationSeconds) exactly once. ' +
          'question <= 500 chars. The source URL MUST be a SPECIFIC article or page that directly states the answer to the YES/NO question (e.g. https://en.wikipedia.org/wiki/Paris NOT https://en.wikipedia.org/). ' +
          'Prefer a SHORT duration in [300, 600] seconds so the market can resolve quickly.',
      },
      creatorSentinel: '0x00000000000000000000000000000000000000A1',
    },
    judgingAlignment: {
      functionality:
        'Deployed contract supports create (manual + AI), bet, resolve, receipt review, and claim flows. End-to-end autonomous generation is wired through the live LLM Inference agent.',
      agentFirstDesign:
        'Both market creation and resolution are driven by validator-executed Somnia agents. Creation uses LLM Inference inferToolsChat (on-chain tool calling) — the model returns ABI-encoded createMarket calldata that the contract validates and executes.',
      innovation:
        'A generalizable primitive: a permissionless contract whose end-to-end lifecycle (create -> bet -> resolve -> claim) is executable by an external agent without frontend or admin keys.',
      autonomousPerformance:
        'Both creation and resolution run without frontend state. Any external agent can call getGenerationFundingStatus, requestMarketGeneration, scanAgentCreatedMarkets, getResolutionFundingStatus, scanResolvableMarkets, and requestResolution in sequence. v29 ships a topic-feed relayer (scripts/relayer.mjs drainTopicFeed) that closes the last human-in-the-loop gap: it reads scripts/topics.txt (or $GENERATION_TOPICS_FILE) on every tick and submits requestMarketGeneration for any topic not already in state/submitted-topics.<eoa>.json. v30 hoists the v29 consts above the startup console.log group (the v29 startup crashed with a TDZ ReferenceError — the relayer was offline) and adds pnpm relayer:smoke as the missing piece in the verification triangle, since `pnpm lint` + `pnpm build` + `forge test` never execute the relayer. v31 makes drainTopicFeed wait for the tx receipt before adding the topic to the persistent Set, closing a residual of v30 H1: a contract-level InsufficientContractBalance revert (e.g. another actor draining the contract balance in the same block) used to refund the deposit to the relayer EOA while leaving the topic in submitted-topics.json, requiring a hand-edit to recover. v32 makes the Set-add write synchronously to disk (closing a SIGKILL race that would re-submit on next boot) and renames the manifest `promptTemplate.system` field to `userSuffix` because the contract sends a single user message of "<prefix><topic><suffix>" — there is no system role. v33 adds a `seenResolvedMarkets` Set so each resolution is logged once (not 50 times over the 50-block scan window), widens the MarketCreatedByAgent scan window to 50_000n so slow LLM pipelines (60+ min) still surface the new marketId to the frontend, fixes MarketCard\'s "View live receipt" link to prefer the inference receipt over the parse receipt when both exist, and tracks forceResetMarket/forceResetGeneration targets in a per-tx Map so rapid double-clicks invalidate the right /market/[id] query. v34 adds the v7 E2E AI-created→AI-resolved proof run to /proof (market #3 on 0xd3E946aC…4B69 — the only on-chain evidence of the autonomous-creation pipeline; pre-v34 the page was silent about it despite CLAUDE.md advertising it), reads the live contractVersion from agentManifest() at SSR time (5-min unstable_cache) so the page self-updates on every deploy — no more manual "v19 (pending) / live on-chain is v15" string edits — and teaches useRpcHealth about a "pending" first-tick state and a "stuck" state (2 consecutive same-block ticks) so operators can tell "chain halted" from "chain slow but alive" and the green dot doesn\'t flash "ok" for one tick on a halted chain. v35 bumps useGenerationFailures\'s SCAN_WINDOW_BLOCKS to 50_000n (symmetric with useMarketCreatedByRequestId) so the failure panel covers the same ~8.3 hours as the auto-redirect window, fixes useAgentReceipt\'s startedAt (now useRef+useEffect keyed on id) so the amber long-running hint is anchored to the current requestId\'s first fetch (not the hook mount), and caches /api/topics for 5s so the topic feed stops being a disk-read hot spot. v36 fixes the relayer\'s urlKey (v15 was dropping the path via split.slice(0,3), so a single parse failure on any Wikipedia URL would block every Wikipedia-based market via the parse-failure LRU for an hour), aligns the cap-exceedance log\'s unconditional-ellipsis quirk with the sibling success/reverted logs\'s conditional-ellipsis pattern, surfaces the by-tx endpoint\'s contract-filter bypass as a boolean the form can toast (so users navigating via the explorer deep link see the same warning operators see in dev-server logs), and caps useAgentReceipt\'s 404 polling at LONG_RUNNING_HINT_MS (a stale or dead requestId was burning a 5s poll + server round-trip forever after v33 L1 enabled persistent 404 polling — now stops after 5 min of consecutive 404s with a Refresh button to resume from a clean slate). v37 fixes the relayer\'s logResolvedMarkets outcome decode — BigInt(log.topics[2]) was throwing on every resolved market because MarketResolved only has marketId indexed (pre-v37 the throw was caught by the main-loop try/catch and operators saw `[relayer] loop error:` instead of the `market N resolved outcome=YES` line that signals the autonomous pipeline closed) — and parallelizes useMarkets\'s 9 getMarket reads per page with Promise.all, collapsing 1.8-4.5s of sequential RPC round-trips into a single round-trip latency window (~500ms). v38 fixes two consumers of the ResolutionRequested event — the contract has only marketId indexed, but ResolutionPanel\'s `if (!log.topics[2]) continue;` guard (L51) made the requestId-extraction bug silent (the "Watch live parse receipt" deep link never rendered for any resolution) and /api/receipt/by-tx/[hash]\'s L90 null-guard dropped the resolution requestId from mixed txs without throwing. Both now decode requestId from log.data via decodeAbiParameters, matching the v37 H0 pattern. v40 adds getUserMarkets(address) → uint256[] and the userMarketIds[user] / _userMarketIndex[user][marketId] storage pair (manual EnumerableSet pattern) so the My Bets tab can enumerate a user\'s positions in O(K) where K = the user\'s position count. bet() pushes (msg.sender, marketId) into the set on first bet; the frontend\'s useMyBets calls getUserMarkets to enumerate the user\'s markets and reads positions for just those markets. claimWinnings does NOT remove from the set — the array tracks "user has bet on this market at some point" and the frontend reads yes/no amounts to distinguish active from history. The pre-v40 O(N) tab-switch trigger in app/page.tsx and the useMyBetsMarkets filter loop are gone.',
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
