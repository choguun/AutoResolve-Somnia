#!/usr/bin/env node
// AutoResolve on-chain relayer.
//
// Watches the deployed AutonomousPredictionMarket for ResolutionFailed events
// and any open markets past endTime that have no parseRequestId, then re-calls
// requestResolution(marketId). This closes the only "human in the loop" gap in
// the autonomous pipeline: a Somnia agent failure used to require a human to
// re-trigger resolution. Now any funded EOA running this script will keep the
// pipeline moving.
//
//   PRIVATE_KEY=0x... NEXT_PUBLIC_CONTRACT_ADDRESS=0x... \
//     node scripts/relayer.mjs
//
// Env (all optional except PRIVATE_KEY + NEXT_PUBLIC_CONTRACT_ADDRESS):
//   SHANNON_RPC_URL         defaults to https://dream-rpc.somnia.network
//   RELAYER_POLL_MS         seconds between scans (default 30)
//   RELAYER_MAX_TOPUP_STT   max STT willing to spend on a single top-up (default 1).
//                           RELAYER_MAX_BET_GAS is honored as a deprecated alias.
//   RELAYER_MAX_ATTEMPTS    per-market resubmit cap before giving up (default 5).
//                           Reset by restarting the relayer after refilling the contract.
//   RELAYER_VERBOSE         1 to log every market scanned, 0 to log only retries (default 1)
//
// SPOF NOTE (v15): this relayer is a single point of failure for the "fully
// autonomous" claim. If the EOA runs out of gas, the key is lost, or the host
// crashes, the on-chain surface (forceResetMarket / forceResetGeneration) is
// still callable by anyone, but no one will retry stuck markets or auto-reset
// them. To get a second watchdog without cross-instance coordination, run a
// second relayer with a SECOND PRIVATE_KEY pointed at the same contract. The
// per-market `alreadySubmitted` set is per-process, so two instances will
// occasionally double-submit, but the contract reverts MarketNotOpen on the
// second submission and the relayer logs and moves on. A more elaborate fix
// (e.g. on-chain idempotency via a nonce map) is out of scope for v15.
//
// Requires `pnpm install` to have produced lib-web/abi.json (via `pnpm export-abi`).

import { readFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  http,
  keccak256,
  toBytes,
  formatEther,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// v48 (L3): hoisted to the top of the file so the startup log at L169
// can reference it without a TDZ throw (the same lesson v30 H0 applied
// to TOPICS_FILE / SUBMITTED_TOPICS_FILE / TOPIC_FEED_MAX_PER_TICK).
// The smoke test at scripts/relayer-smoke.sh greps for this string
// verbatim — update both files in sync on every relayer version bump.
// v51: bumped v48 -> v50 to track the v49 (docs sweep) + v50 (DEPLOYED
// body changelog + judgingAlignment sentence) polish cycles. The
// relayer's own behavior is unchanged in v49/v50 (no new relayer
// code paths, no new log lines, no new ENV vars), but the version
// constant tracks the shipped audit surface so the smoke grep
// continues to be the test of record.
const RELAYER_VERSION = 'v68';
const SHANNON_RPC_URL = process.env.SHANNON_RPC_URL ?? 'https://dream-rpc.somnia.network';
const POLL_MS = Number(process.env.RELAYER_POLL_MS ?? 30) * 1000;
const MAX_TOPUP_STT = process.env.RELAYER_MAX_TOPUP_STT ?? process.env.RELAYER_MAX_BET_GAS ?? '1';
const VERBOSE = process.env.RELAYER_VERBOSE !== '0';
const MAX_ATTEMPTS_PER_MARKET = Number(process.env.RELAYER_MAX_ATTEMPTS ?? 5);
// viem does not auto-chunk getLogs. The Shannon RPC rejects oversized ranges
// (typical cap ~1000 blocks), so after a long relayer downtime the fromBlock→toBlock
// span can be 10K+ blocks and a single getLogs call fails. We chunk in 1000-block
// windows and only advance the cursor on a fully-successful drain — otherwise the
// relayer would wedge on every subsequent tick re-trying the same oversized range.
const LOG_CHUNK_SIZE = 1000n;
// v15: exponential backoff between failed resolution attempts within the same
// relayer lifetime. v10's RELAYER_MAX_ATTEMPTS cap (default 5) closed the
// gas-DoS vector but allowed 5 attempts in 2.5 minutes. v15 schedules each
// retry at 30s * 2^(attempts-1) — 30s, 60s, 120s, 240s, 480s, capped at
// MAX_BACKOFF_MS. The attempt count is reset on success.
const BASE_BACKOFF_MS = POLL_MS;
const MAX_BACKOFF_MS = 30 * 60 * 1000;
// v15: parse-failure LRU cache. A market whose parse callback fails
// (ResolutionFailed with stage=ParseWebsite) won't resolve on the next retry
// either — the same bad URL will fail the same way. The LRU keys on a
// normalized URL hash and skips re-submission for PARSE_FAILURE_TTL_MS. v15
// was in-memory only; v16 (H3) persists the cache to disk via an atomic
// rename so a relayer restart doesn't re-attempt a URL it already proved
// unparseable.
const PARSE_FAILURE_TTL_MS = 60 * 60 * 1000;
const PARSE_FAILURE_CACHE_LIMIT = 256;
// Override via env. Default lives under the repo's .gitignore'd `state/`
// directory so the cache is naturally co-located with `deploy-state.json`.
// v17 (M1): the file is namespaced by the relayer EOA — two relayers running
// on the same host (or sharing a volume) no longer clobber each other's
// parse-failure cache. The EOA suffix is lowercase so it's filesystem-safe
// on case-sensitive hosts.
if (!process.env.PRIVATE_KEY) {
  console.error('Error: PRIVATE_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}
if (!process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) {
  console.error('Error: NEXT_PUBLIC_CONTRACT_ADDRESS is not set (run scripts/deploy.sh first).');
  process.exit(1);
}

const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const account = privateKeyToAccount(process.env.PRIVATE_KEY.startsWith('0x')
  ? process.env.PRIVATE_KEY
  : `0x${process.env.PRIVATE_KEY}`);

// v17 (M1): derive the cache file path after `account` is set so the EOA
// address is available for namespacing. Operators can still override with
// PARSE_FAILURE_CACHE_FILE for unusual layouts (read-only volume, custom
// test fixture, etc.).
const PARSE_FAILURE_CACHE_FILE = process.env.PARSE_FAILURE_CACHE_FILE
  || join(ROOT, 'state', `parse-failure-cache.${account.address.toLowerCase()}.json`);

const abiJson = JSON.parse(await readFile(join(ROOT, 'lib-web/abi.json'), 'utf8'));
const ABI = abiJson.abi ?? abiJson;

const somniaTestnet = {
  id: 50312,
  name: 'Somnia Shannon Testnet',
  network: 'somnia-shannon',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: [SHANNON_RPC_URL] },
    public: { http: [SHANNON_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Shannon Explorer', url: 'https://shannon-explorer.somnia.network' },
  },
  testnet: true,
};

const transport = http(SHANNON_RPC_URL, { retryCount: 3, retryDelay: 1000 });
const publicClient = createPublicClient({ chain: somniaTestnet, transport });
const walletClient = createWalletClient({ chain: somniaTestnet, transport, account });

const RESOLUTION_FAILED_TOPIC = keccak256(
  toBytes('ResolutionFailed(uint256,uint256,uint8,uint8)'),
);
const MARKET_RESOLVED_TOPIC = keccak256(
  toBytes('MarketResolved(uint256,bool,string,uint256)'),
);
const GENERATION_FAILED_TOPIC = keccak256(
  toBytes('GenerationFailed(uint256,uint8,string)'),
);
// v16 (M1): emitted by _resolveWithLLMInference when the parse callback
// succeeded but the inference deposit couldn't be paid. The relayer watches
// these and routes them to retryInferenceFromCache (instead of the
// wasteful re-parse path) once the contract is refilled.
const INFERENCE_UNDERFUNDED_TOPIC = keccak256(
  toBytes('InferenceUnderfunded(uint256,uint256,string)'),
);
// v62 (M0): relayer-driven auto-liquidity. Watched for fresh
// MarketCreated events so the relayer can seed YES+NO bets on every
// newly-created market (env-gated via RELAYER_LIQUIDITY_STT). The
// event signature mirrors the contract's MarketCreated at
// src/AutonomousPredictionMarket.sol:244.
const MARKET_CREATED_TOPIC = keccak256(
  toBytes('MarketCreated(uint256,address,string,string,uint256)'),
);
// v29 (H1): topic-feed source for autonomous market generation. The relayer
// reads GENERATION_TOPICS_FILE (one topic per line, # = comment) and submits
// `requestMarketGeneration(topic)` for each unseen topic. The set of already-
// submitted topics is persisted to disk so a relayer restart doesn't re-submit
// the same topic (the contract would forward another inference deposit, wasting
// STT — and the platform would either return a duplicate market or the same
// failure as last time). EOA-namespaced so two relayers on the same host
// (e.g. mainnet + testnet, or primary + watchdog) don't clobber each other.
// v30 (H0): hoisted above the startup console.log group (was previously
// declared at L203 / L1107) — referencing TOPICS_FILE in the L155 log line
// threw a ReferenceError on startup and the relayer never reached the main
// loop. The startup log now needs both values; moving the declarations up is
// cleaner than splitting the log.
const TOPICS_FILE = process.env.GENERATION_TOPICS_FILE
  || join(ROOT, 'scripts', 'topics.txt');
const SUBMITTED_TOPICS_FILE = process.env.SUBMITTED_TOPICS_FILE
  || join(ROOT, 'state', `submitted-topics.${account.address.toLowerCase()}.json`);
// v30 (H0): also hoisted from L1107 (see the drainTopicFeed block below for
// the per-tick rate-limit context). 30s cadence × 2880 ticks/day × max
// 1/tick = up to 2880 topic submissions/day, well above any demo cadence.
const TOPIC_FEED_MAX_PER_TICK = Number(process.env.TOPIC_FEED_MAX_PER_TICK ?? 1);
// v62 (M0): relayer-driven auto-liquidity. When RELAYER_LIQUIDITY_STT > 0,
// the relayer places a YES + NO seed bet of that amount on every newly-
// created market (from the relayer EOA's own STT balance), and auto-claims
// the winnings back on MarketResolved. Default '0' = disabled (opt-in via
// env to keep the first deploy safe and to avoid silently draining the
// relayer EOA on a flood of markets). The seed lands in `marketBets[id]`
// like any other bet, so the UI sees it as just a bump to yesTotal/noTotal
// — no new component, no new copy. Future v2 will introduce real on-chain
// AMM LP (addLiquidity/removeLiquidity) reserved here as a manifest stub.
const RELAYER_LIQUIDITY_STT = process.env.RELAYER_LIQUIDITY_STT ?? '0';
const LIQUIDITY_SEED_MAX_PER_TICK = Number(process.env.RELAYER_SEED_MAX_PER_TICK ?? 5);
// v68 (M0): relayer-driven auto-funding. Target balance the
// relayer maintains for the contract. 0 = disabled (default).
// When non-zero, the relayer tops up the contract to
// RELAYER_AUTO_FUND_STT + RELAYER_AUTO_FUND_STT * 0.5 on every
// tick where the balance falls below the target. Bounded per
// refill by RELAYER_AUTO_FUND_MAX_PER_REFILL_STT and 10% of the
// relayer EOA balance.
const RELAYER_AUTO_FUND_STT = process.env.RELAYER_AUTO_FUND_STT ?? '0';
const RELAYER_AUTO_FUND_MAX_PER_REFILL_STT = process.env.RELAYER_AUTO_FUND_MAX_PER_REFILL_STT ?? '2';
// v66 (M0): periodic partial-seed retry interval. Default 60 ticks =
// ~30 minutes at POLL_MS=30s. The retry scans all seeded markets
// and re-attempts the missing side (the Somnia state-trie bug can
// commit userNoBets + marketBets.push but roll back market.noTotal,
// leaving the relayer EOA with a half-seed).
const RETRY_PARTIAL_SEED_INTERVAL_TICKS = Number(
  process.env.RELAYER_RETRY_PARTIAL_SEED_INTERVAL_TICKS ?? 60,
);
const SEEDED_FILE = process.env.SEEDED_FILE
  || join(ROOT, 'state', `seeded-markets.${account.address.toLowerCase()}.json`);
const CLAIMED_FILE = process.env.CLAIMED_FILE
  || join(ROOT, 'state', `claimed-markets.${account.address.toLowerCase()}.json`);

console.log(`[relayer] starting (${RELAYER_VERSION})`);
console.log(`  rpc:         ${SHANNON_RPC_URL}`);
console.log(`  contract:    ${CONTRACT}`);
console.log(`  relayer eoa: ${account.address}`);
console.log(`  poll:        ${POLL_MS / 1000}s`);
console.log(`  max top-up:  ${MAX_TOPUP_STT} STT per market`);
console.log(`  max attempts: ${MAX_ATTEMPTS_PER_MARKET} per market before giving up`);
console.log(`  topic feed:  ${TOPICS_FILE} (max ${TOPIC_FEED_MAX_PER_TICK}/tick)`);
console.log(
  `  liquidity:  ${RELAYER_LIQUIDITY_STT === '0' ? 'disabled' : `${RELAYER_LIQUIDITY_STT} STT per side (max ${LIQUIDITY_SEED_MAX_PER_TICK}/tick)`}`,
);

let lastScannedBlock = await publicClient.getBlockNumber();
console.log(`  resume from block: ${lastScannedBlock}\n`);

// v63 (M1): read the contract's MIN_BET on startup so seedMarket's
// under-floor guard is dynamic, not hardcoded to 0.001 STT. If the
// contract's MIN_BET is ever bumped (e.g. for chain-level inflation
// adjustment), the relayer picks up the new value on the next deploy.
// The read is wrapped in try/catch — a contract ABI that doesn't
// expose MIN_BET (e.g. a pre-v8 contract) falls back to the 0.001
// STT literal so the relayer still works on legacy contracts.
let minBetWei = 1000000000000000n /* 0.001 STT fallback */;
try {
  minBetWei = await publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'MIN_BET',
  });
  console.log(`[relayer] contract MIN_BET: ${formatEther(minBetWei)} STT`);
} catch (err) {
  console.warn(
    `[relayer] could not read contract MIN_BET (using 0.001 STT fallback):`,
    err.shortMessage ?? err.message,
  );
}

// Per-market attempt counter. Lives in memory for the relayer's lifetime; on
// restart, all markets get a fresh budget. This stops a permanently underfunded
// contract from draining the relayer EOA via infinite resubmits — the operator
// can see the "needs refill" log and either refill the contract or restart the
// relayer after doing so.
const attemptCount = new Map();
// v14: parallel cap for forceResetMarket / forceResetGeneration. A reset that
// keeps failing 3 ticks in a row signals something structurally wrong (RPC
// rejecting writes, contract reverting on a fresh-enough check, etc.) and we
// should stop hammering the chain. Reset on relayer restart, same as
// attemptCount. Keyed with a "reset:" prefix so it never collides with the
// resolution budget for the same market id.
const RESET_MAX_ATTEMPTS = 3;
const resetAttemptCount = new Map();
// v15: exponential backoff for resolution retries. nextRetryAt.get(key) is
// the wall-clock ms timestamp at which the next attempt is allowed. Cleared
// on success.
const nextRetryAt = new Map();
// v15: parse-failure LRU. Map<urlHash, expiresAtMs>. getAgentMarketContext is
// called for every market in the resolvable list, and the URL hash check is
// O(1). The LRU is bounded by PARSE_FAILURE_CACHE_LIMIT — eviction is FIFO.
const parseFailureCache = new Map();
// v23 (L1): module-level dedup Set for GenerationFailed events. The per-tick
// alreadySubmitted Set passed into drainGenerationFailureEvents is created
// fresh on every loop iteration, so a failure that stays in the last 50
// blocks (≈50s of chain history) gets logged on every 30s tick. The 50-block
// window is the only practical scan range for advisory events (no forward
// cursor advance on a log we don't act on), so the dedup has to persist
// across ticks. FIFO-capped so a long-running relayer with many distinct
// failed requests doesn't grow unbounded — 1000 entries covers weeks of
// failed requests at typical demo cadence.
const seenGenerationFailures = new Set();
const SEEN_GEN_FAILURE_LIMIT = 1000;
// v33 (H0): module-level dedup Set for MarketResolved events. logResolvedMarkets
// scans the same 50-block window every tick, so a market that resolved at
// block N stays in the window for the next 50 ticks (~25 min at POLL_MS=30s).
// Without dedup, the same "market N resolved outcome=YES" line is printed 50
// times, filling the operator's terminal with duplicates. The seenGenerationFailures
// pattern above is the template; resolved events are positive (success), so a
// 1000-entry FIFO cap covers weeks of resolutions at typical demo cadence.
const seenResolvedMarkets = new Set();
const SEEN_RESOLVED_LIMIT = 1000;
const maxWei = parseEther(MAX_TOPUP_STT);
// v62 (M0): auto-liquidity state. seededMarkets tracks every market
// the relayer has already placed the YES+NO seed bet on (cross-restart
// dedup, persisted to disk on every add to survive SIGKILL). seenClaimed
// is the in-memory FIFO dedup for the post-resolution claimWinnings
// path — the resolved-events scan is bounded to a 50-block window and
// re-scans every tick, so the FIFO prevents repeated "claimed market
// N" log lines for already-handled resolutions.
const seededMarkets = new Set();
const seenClaimedMarkets = new Set();
const SEEN_CLAIMED_LIMIT = 1000;
let lastScannedSeedBlock = 0n;
// v65 (H0): backfill-on-startup flag. The backfill runs ONCE on the
// first tick after startup, scanning [1, nextMarketId) for any
// Open market where the relayer EOA hasn't already placed the
// YES+NO seed. This catches markets created BEFORE the v62
// auto-seed feature was enabled (the v62 cursor initialized to
// `head` on first tick, missing historical MarketCreated events).
// 8 markets on the live contract (4, 5, 6, 7, 8, 9, 10, 11) were
// missed by this initial-skip pattern; the backfill seeds them.
// The flag is in-memory only — a relayer restart runs the
// backfill again, which is idempotent (seedMarket dedups via
// seededMarkets + getMarketBets check).
let hasBackfilled = false;
// v66 (M0): periodic partial-seed retry counter. The backfill runs
// ONCE on the first tick. After that, partial seeds (e.g. a YES bet
// that landed but the NO bet that the Somnia state-trie rolled back)
// would only recover on the next relayer restart. The periodic
// retry runs every RETRY_PARTIAL_SEED_INTERVAL_TICKS ticks (default
// 60 = ~30 minutes at 30s POLL_MS) and scans the seededMarkets
// Set for any market where the relayer EOA lacks both YES + NO
// bets, re-attempting the missing side. This is bounded — at most
// LIQUIDITY_SEED_MAX_PER_TICK re-seeds per tick.
// v67 (L2): flaggedPartials Set — markets where the relayer
// detected a partial seed (one side landed, the other didn't due
// to the Somnia state-trie bug). These are retried EVERY tick
// (not just every 30 min) so the operator sees a "partial" pill
// for the minimum possible window. Cleared when both sides land.
const flaggedPartials = new Map(); // marketId (string) -> { attempts }
let tickCount = 0;
// v63 (H1): stranded-seed observability. Maps seeded marketId → its
// resolutionSource URL, for markets whose URL is currently in the
// parse-failure LRU. The relayer can't recover the seed (the market
// never resolves while the URL is cached), so the operator needs
// visibility into how much STT is locked. Each tick, scan this Map
// and log advisory lines for any URLs that have been evicted from
// the LRU (TTL or FIFO eviction) — the next tryResolveMarket scan
// will then re-attempt resolution.
// v64 (M0): the Map is now persisted to state/stranded-seeds.<eoa>.json
// on every mutation (tryResolveMarket cache hit adds; drainStrandedSeeds
// eviction removes; SIGTERM/SIGINT also flushes). The dApp's /proof
// page polls the shim's /stranded-seeds endpoint, which reads the
// file directly. Without persistence, a relayer restart would
// clear the Map and the dApp would show "0 stranded" even though
// the on-disk state (seeded-markets + parse-failure-cache) still
// has stranded capital.
const strandedSeedMarkets = new Map();
const STRANDED_FILE = process.env.STRANDED_FILE
  || join(ROOT, 'state', `stranded-seeds.${account.address.toLowerCase()}.json`);

// v29 (H1) + v30 (H0): TOPICS_FILE / SUBMITTED_TOPICS_FILE / TOPIC_FEED_MAX_PER_TICK
// were hoisted to L160–167 so the L176 startup log line can reference them
// without hitting TDZ. This leaves just the in-memory Set declaration here.
const submittedTopics = new Set();

function marketKey(marketId) {
  // Normalize so a market that appears in both the event stream (hex) and the
  // scan (bigint) hits the same Set entry. Topics are 32-byte ABI-encoded
  // uint256, so BigInt() decodes both shapes the same way.
  return BigInt(marketId).toString();
}

function urlKey(url) {
  // v36 (H0): hash the FULL normalized URL. v15 dropped the path via
  // split('/').slice(0, 3) — so the key for
  // https://en.wikipedia.org/wiki/Paris was hash('https://en.wikipedia.org'),
  // and a single parse failure on ANY path on that host added
  // hash('https://en.wikipedia.org') to the parse-failure LRU. Every
  // subsequent Wikipedia-based market (and any other host sharing the same
  // scheme+host) was then silently skipped by isUrlInParseFailureCache for
  // PARSE_FAILURE_TTL_MS. The v15 comment claimed "the path is
  // case-sensitive in the LLM parsing sense, so we leave the path alone"
  // but the implementation contradicted it. The djb2 body is unchanged;
  // only the input string is different. The case-folding (trim +
  // toLowerCase) is retained so "https://Example.com/path" and
  // "https://example.com/PATH" still share an entry.
  const normalized = url.trim().toLowerCase();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) | 0;
  }
  return hash.toString();
}

// v16 (H3): persistence layer for the parse-failure cache. v15's cache was
// in-memory only, so a relayer restart (deploy, host reboot, OOM) wiped the
// LRU and the relayer would re-attempt every previously-failed URL. v16
// writes through to a JSON file with an atomic rename (write to .tmp, then
// rename — rename is atomic on the same filesystem), so a crash mid-write
// leaves either the old file or the new file, never a half-written one.
//
// The write is debounced: a tick that hits 5 failed URLs in quick succession
// only triggers one disk write. The single-tick concurrency model means we
// don't need a write lock — the file rename is the lock.
function loadParseFailureCache() {
  if (!existsSync(PARSE_FAILURE_CACHE_FILE)) return;
  try {
    const raw = readFileSync(PARSE_FAILURE_CACHE_FILE, 'utf8');
    if (!raw) return;
    const data = JSON.parse(raw);
    const now = Date.now();
    let loaded = 0;
    let droppedExpired = 0;
    for (const [k, v] of Object.entries(data)) {
      if (typeof v !== 'number') continue;
      if (v > now) {
        parseFailureCache.set(k, v);
        loaded++;
      } else {
        droppedExpired++;
      }
    }
    if (loaded > 0) {
      console.log(
        `[relayer] loaded ${loaded} parse-failure cache entries from disk` +
          (droppedExpired > 0 ? ` (dropped ${droppedExpired} expired)` : ''),
      );
    }
  } catch (err) {
    console.warn(
      '[relayer] parse-failure cache load failed (starting empty):',
      err.message,
    );
  }
}

let parseFailureCacheWriteTimer = null;
let parseFailureCacheWriteDirty = false;
function scheduleParseFailureCacheSave() {
  parseFailureCacheWriteDirty = true;
  if (parseFailureCacheWriteTimer) return;
  parseFailureCacheWriteTimer = setTimeout(() => {
    parseFailureCacheWriteTimer = null;
    if (!parseFailureCacheWriteDirty) return;
    parseFailureCacheWriteDirty = false;
    saveParseFailureCache();
  }, 5000);
}

function saveParseFailureCache() {
  try {
    const data = Object.fromEntries(parseFailureCache);
    const tmp = PARSE_FAILURE_CACHE_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, PARSE_FAILURE_CACHE_FILE);
  } catch (err) {
    console.warn('[relayer] parse-failure cache save failed:', err.message);
  }
}

// Synchronous flush used in SIGTERM/SIGINT handlers so we don't lose cache
// state on a graceful shutdown. Async writes in flight are dropped — the
// next tick (if any) will reschedule.
function flushParseFailureCacheSync() {
  if (parseFailureCacheWriteTimer) {
    clearTimeout(parseFailureCacheWriteTimer);
    parseFailureCacheWriteTimer = null;
  }
  if (parseFailureCacheWriteDirty) {
    parseFailureCacheWriteDirty = false;
    saveParseFailureCache();
  }
}

function cacheParseFailure(url) {
  if (parseFailureCache.size >= PARSE_FAILURE_CACHE_LIMIT) {
    // FIFO evict the oldest entry. Map iteration is insertion-order, so the
    // first key is the oldest.
    const oldest = parseFailureCache.keys().next().value;
    parseFailureCache.delete(oldest);
  }
  parseFailureCache.set(urlKey(url), Date.now() + PARSE_FAILURE_TTL_MS);
  scheduleParseFailureCacheSave();
}

function isUrlInParseFailureCache(url) {
  const k = urlKey(url);
  const expiresAt = parseFailureCache.get(k);
  if (expiresAt === undefined) return false;
  if (expiresAt < Date.now()) {
    parseFailureCache.delete(k);
    scheduleParseFailureCacheSave();
    return false;
  }
  return true;
}

// v29 (H1): persistent dedup of submitted topics. The set is keyed on the raw
// topic string (trimmed) — the contract doesn't store a topic→requestId
// mapping, so once a topic is submitted we have to remember it client-side to
// avoid re-submission. Persisted to disk on every successful submit (debounced
// to one write per 5s window, same as the parse-failure cache) so a relayer
// restart doesn't re-submit the same topics and waste inference deposits.
let submittedTopicsWriteTimer = null;
let submittedTopicsWriteDirty = false;

function loadSubmittedTopics() {
  // v60 (L0): allow the operator to skip loading the submitted-topics
  // Set on startup. Use case: a fresh contract deploy has different
  // markets, so the Set entries (which key by topic text) are stale
  // and the relayer would never re-submit today's daily markets
  // (the Set thinks they were already submitted to the prior contract).
  // Set RESET_SUBMITTED_TOPICS=1 in the relayer env for one deploy
  // to clear the Set; remove it on the next deploy so the normal
  // dedup resumes.
  if (process.env.RESET_SUBMITTED_TOPICS === '1') {
    try {
      unlinkSync(SUBMITTED_TOPICS_FILE);
    } catch {
      // file didn't exist — that's fine
    }
    console.log('[relayer] RESET_SUBMITTED_TOPICS=1 — cleared submitted-topics Set');
    return;
  }
  if (!existsSync(SUBMITTED_TOPICS_FILE)) return;
  try {
    const raw = readFileSync(SUBMITTED_TOPICS_FILE, 'utf8');
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      let count = 0;
      for (const t of arr) {
        if (typeof t === 'string' && t.length > 0 && t.length <= 200) {
          submittedTopics.add(t);
          count++;
        }
      }
      if (count > 0) {
        console.log(`[relayer] loaded ${count} submitted-topic(s) from disk`);
      }
    }
  } catch (err) {
    console.warn(
      '[relayer] submitted-topics cache load failed (starting empty):',
      err.message,
    );
  }
}

function saveSubmittedTopics() {
  try {
    const arr = Array.from(submittedTopics);
    const tmp = SUBMITTED_TOPICS_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(arr));
    renameSync(tmp, SUBMITTED_TOPICS_FILE);
  } catch (err) {
    console.warn('[relayer] submitted-topics cache save failed:', err.message);
  }
}

// v32 (H1): the 5s-debounced scheduleSubmittedTopicsSave was the source
// of a SIGKILL race — if the relayer was killed between the in-memory
// add and the debounce's disk flush, the next boot would re-read the
// old file and re-submit the topic (duplicate requestMarketGeneration,
// ~0.3 STT inference deposit burned). drainTopicFeed now calls
// saveSubmittedTopics() synchronously after the Set-add (writeFileSync +
// renameSync is atomic, so the on-disk file is always either pre-add
// or post-add, never partial). The debounce is no longer needed; the
// sync write is ~5ms of disk time per topic submission, bounded by
// TOPIC_FEED_MAX_PER_TICK (default 1). flushSubmittedTopicsSync is
// retained below as a no-op defensive flush on SIGINT/SIGTERM (it's
// always a no-op now that the debounce variables are never set, but
// removing the call sites from the signal handlers is a bigger
// refactor for no functional gain).

function flushSubmittedTopicsSync() {
  if (submittedTopicsWriteTimer) {
    clearTimeout(submittedTopicsWriteTimer);
    submittedTopicsWriteTimer = null;
  }
  if (submittedTopicsWriteDirty) {
    submittedTopicsWriteDirty = false;
    saveSubmittedTopics();
  }
}

// v62 (M0): auto-liquidity persistence. Mirrors the submitted-topics
// pattern: in-memory Set + EOA-namespaced JSON file on disk, sync
// write after every change (the seed bet costs 0.02 STT per market —
// a SIGKILL race that re-seeds on restart is bounded by the cost
// of one extra seed, ~0.02 STT, not catastrophic). The seed-set
// keys on `marketId.toString()` for human-readable JSON. The
// claimed-set lives in memory only (losing it on restart just
// means a re-scan of the 50-block resolved window will try to claim
// again, which the contract's NoWinningBets revert handles
// gracefully).
function loadSeededMarkets() {
  if (!existsSync(SEEDED_FILE)) return;
  try {
    const raw = readFileSync(SEEDED_FILE, 'utf8');
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      let count = 0;
      for (const k of arr) {
        if (typeof k === 'string' && /^\d+$/.test(k) && k !== '0') {
          seededMarkets.add(k);
          count++;
        }
      }
      if (count > 0) {
        console.log(`[relayer] loaded ${count} seeded-market(s) from disk`);
      }
    }
  } catch (err) {
    console.warn(
      '[relayer] seeded-markets cache load failed (starting empty):',
      err.message,
    );
  }
}

function saveSeededMarkets() {
  try {
    const arr = Array.from(seededMarkets);
    const tmp = SEEDED_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(arr));
    renameSync(tmp, SEEDED_FILE);
  } catch (err) {
    console.warn('[relayer] seeded-markets cache save failed:', err.message);
  }
}

function saveClaimedMarkets() {
  try {
    const arr = Array.from(seenClaimedMarkets);
    const tmp = CLAIMED_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(arr));
    renameSync(tmp, CLAIMED_FILE);
  } catch (err) {
    console.warn('[relayer] claimed-markets cache save failed:', err.message);
  }
}

// v64 (M0): stranded-seeds persistence. Loads on startup (rehydrates
// the in-memory Map from disk) and saves on every mutation. The
// file is an array of { marketId, url, expiresAt } entries — the
// urlKey isn't stored because the dApp's /stranded-seeds endpoint
// re-derives it from the URL on each request. The dApp polls the
// shim, which reads this file directly. Sync write is fine — the
// set only changes at most once per tick, and the cost is ~5ms
// per save (atomic via tmp + rename).
function loadStrandedSeeds() {
  if (!existsSync(STRANDED_FILE)) return;
  try {
    const raw = readFileSync(STRANDED_FILE, 'utf8');
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      let count = 0;
      for (const entry of arr) {
        if (
          entry &&
          typeof entry.marketId === 'string' &&
          typeof entry.url === 'string'
        ) {
          strandedSeedMarkets.set(entry.marketId, entry.url);
          count++;
        }
      }
      if (count > 0) {
        console.log(`[relayer] loaded ${count} stranded-seed(s) from disk`);
      }
    }
  } catch (err) {
    console.warn(
      '[relayer] stranded-seeds cache load failed (starting empty):',
      err.message,
    );
  }
}

function saveStrandedSeeds() {
  try {
    const arr = [];
    for (const [marketId, url] of strandedSeedMarkets) {
      const k = urlKey(url);
      const expiresAt = parseFailureCache.get(k);
      // Only persist entries that are still stranded (URL still in
      // cache). This keeps the file small and avoids confusing the
      // dApp with stale entries.
      if (expiresAt === undefined || expiresAt < Date.now()) continue;
      arr.push({ marketId, url, expiresAt });
    }
    const tmp = STRANDED_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(arr));
    renameSync(tmp, STRANDED_FILE);
  } catch (err) {
    console.warn('[relayer] stranded-seeds cache save failed:', err.message);
  }
}

loadParseFailureCache();
loadSubmittedTopics();
loadSeededMarkets();
loadStrandedSeeds();
// v17 (M3): ensure the cache directory exists. A fresh clone may not have
// `state/` yet (deploy.sh creates it, but operators that run the relayer
// standalone won't have that step). Without this, the first save (or
// SIGTERM flush) throws ENOENT and the relayer logs a warning, then loses
// the LRU on shutdown. Idempotent: mkdirSync with recursive:true is a
// no-op when the directory already exists. v29: same guarantee extends to
// the submitted-topics file (uses the same state/ directory).
try {
  mkdirSync(dirname(PARSE_FAILURE_CACHE_FILE), { recursive: true });
} catch (err) {
  console.warn('[relayer] could not create state directory:', err.message);
}

async function getLogsChunked(address, fromBlock, toBlock) {
  // Walk [fromBlock, toBlock] in LOG_CHUNK_SIZE windows. Returns the concat
  // of all successful window results. Throws if any window fails — the caller
  // decides whether to advance the cursor or retry next tick.
  const all = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + LOG_CHUNK_SIZE - 1n;
    const windowEnd = end > toBlock ? toBlock : end;
    const chunk = await publicClient.getLogs({
      address,
      fromBlock: cursor,
      toBlock: windowEnd,
    });
    all.push(...chunk);
    cursor = windowEnd + 1n;
  }
  return all;
}

async function readTopUp() {
  const status = await publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'getResolutionFundingStatus',
  });
  return status[2]; // topUpNeeded
}

async function fetchContextForMarket(marketId) {
  try {
    return await publicClient.readContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'getAgentMarketContext',
      args: [marketId],
    });
  } catch {
    return null;
  }
}

// v16 (M1): the inference deposit alone (0.3 STT) — retryInferenceFromCache
// only needs the inference half because the parse result is already cached
// on-chain in `marketParseResult`.
// v43 (L1): collapse the two-call mirror into a single getGenerationFundingStatus
// read. The v16 mirror (readContract(getInferenceDeposit) + getBalance + local
// arithmetic) returns the same value as the contract's own topUpNeeded, but
// the comment claiming "the inference path doesn't have a direct
// 'getInferenceFundingStatus' view" was wrong — getGenerationFundingStatus
// (AutonomousPredictionMarket.sol:459) returns exactly this triple:
// (getInferenceDeposit, contractBalance, topUpNeeded). The mirror works
// today but is a drift hazard: if the deposit math ever changes (e.g. a
// new deposit getter, a fee, a multiplier), the relayer would silently
// send the wrong amount and the inference call would revert
// InsufficientContractBalance. Same shape as readTopUp at L469-476 for
// requestResolution.
async function readInferenceTopUp() {
  const status = await publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'getGenerationFundingStatus',
  });
  return status[2]; // topUpNeeded
}

// v68 (M0): relayer-driven auto-funding. Top up the contract's
// STT balance whenever it falls below RELAYER_AUTO_FUND_STT. Cheap
// no-op when disabled (RELAYER_AUTO_FUND_STT='0') or when the
// contract is already funded. The cap is per-refill, so a single
// tick can't blow the relayer EOA's balance.
async function maybeAutoFundContract() {
  if (RELAYER_AUTO_FUND_STT === '0') return;
  let targetWei;
  let maxPerRefill;
  try {
    targetWei = parseEther(RELAYER_AUTO_FUND_STT);
    maxPerRefill = parseEther(RELAYER_AUTO_FUND_MAX_PER_REFILL_STT);
  } catch {
    console.warn(
      `[relayer] auto-fund: invalid RELAYER_AUTO_FUND_STT=${RELAYER_AUTO_FUND_STT} or RELAYER_AUTO_FUND_MAX_PER_REFILL_STT=${RELAYER_AUTO_FUND_MAX_PER_REFILL_STT} (must be numeric, in STT). Disabling auto-fund for this process.`,
    );
    return;
  }
  // Read the contract's current STT balance + both funding statuses
  // + the relayer EOA balance in parallel. The funding-status reads
  // return (requiredDeposit, contractBalance, topUpNeeded); the
  // topUpNeeded is the binding constraint for the next batch.
  let contractBalance, resStatus, genStatus, eoaBalance;
  try {
    [contractBalance, resStatus, genStatus, eoaBalance] = await Promise.all([
      publicClient.getBalance({ address: CONTRACT }),
      publicClient.readContract({
        address: CONTRACT,
        abi: ABI,
        functionName: 'getResolutionFundingStatus',
      }),
      publicClient.readContract({
        address: CONTRACT,
        abi: ABI,
        functionName: 'getGenerationFundingStatus',
      }),
      publicClient.getBalance({ address: account.address }),
    ]);
  } catch {
    // Catch-all for RPC errors (network blip, node restart). The
    // function returns; the next tick will re-attempt. The console
    // output is intentionally silent at this layer — the inner
    // Promise.all rejections would otherwise dump 3 stack traces
    // per failed tick.
    return;
  }
  // The highest topUpNeeded is the binding constraint for the next batch.
  const maxTopUpNeeded = resStatus[2] > genStatus[2] ? resStatus[2] : genStatus[2];
  // Target balance: 1.5x the configured threshold. The extra 0.5x
  // is a buffer for the next batch after the immediate refill.
  const topUpTo = targetWei + (targetWei / 2n);
  // v68 (L3): skip only when BOTH conditions are met. The previous
  // logic checked `maxTopUpNeeded === 0n` first, which incorrectly
  // skipped the refill even when the contract was below the
  // threshold (e.g. balance 11 STT, threshold 20 STT, topUpNeeded
  // 0 because requiredDeposit < balance). With the target check
  // first, the refill fires whenever the contract is below the
  // operator-configured threshold.
  if (contractBalance >= topUpTo && maxTopUpNeeded === 0n) return;
  // Compute the refill amount. Cap at min(0.1 * eoaBalance, maxPerRefill).
  // The 10% EOA cap protects the operator's wallet from runaway
  // fills (e.g. a buggy contract that drains the relayer EOA).
  const refillWei = topUpTo - contractBalance;
  const eoaCap = eoaBalance / 10n;
  const cap = eoaCap < maxPerRefill ? eoaCap : maxPerRefill;
  const actualRefill = refillWei > cap ? cap : refillWei;
  if (actualRefill === 0n) {
    console.warn(
      `[relayer] auto-fund: contract needs ${formatEther(refillWei)} STT but refill cap is 0 (EOA balance too low or RELAYER_AUTO_FUND_MAX_PER_REFILL_STT too tight)`,
    );
    return;
  }
  // Send the refill via a plain STT transfer. The contract's
  // receive() function emits RebateReceived; the STT lands in the
  // contract's balance and is available for the next
  // requestResolution / requestMarketGeneration / retryInferenceFromCache.
  console.log(
    `[relayer] auto-fund: contract balance ${formatEther(contractBalance)} STT, ` +
      `topping up ${formatEther(actualRefill)} STT (target ${formatEther(topUpTo)} STT, ` +
      `topUpNeeded ${formatEther(maxTopUpNeeded)} STT)`,
  );
  let hash;
  try {
    hash = await walletClient.sendTransaction({
      to: CONTRACT,
      value: actualRefill,
    });
  } catch (err) {
    console.error(
      `[relayer] auto-fund: sendTransaction failed:`,
      err.shortMessage ?? err.message,
    );
    return;
  }
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 60_000,
  });
  if (receipt.status !== 'success') {
    console.error(
      `[relayer] auto-fund: sendTransaction reverted (blockHash=${receipt.blockHash})`,
    );
    return;
  }
  console.log(
    `[relayer] auto-fund: topped up ${formatEther(actualRefill)} STT ` +
      `(block ${receipt.blockNumber}, tx ${receipt.transactionHash})`,
  );
}

async function tryResolveMarket(marketId, alreadySubmitted) {
  const key = marketKey(marketId);
  if (alreadySubmitted.has(key)) {
    if (VERBOSE) console.log(`[relayer]   skipping market ${marketId} (already queued this tick)`);
    return false;
  }
  // v15: exponential backoff gate. If a previous attempt is still in its
  // backoff window, skip silently. The market will be picked up on a later
  // tick once the window expires.
  const retryAt = nextRetryAt.get(key);
  if (retryAt !== undefined && retryAt > Date.now()) {
    if (VERBOSE) {
      console.log(`[relayer]   skipping market ${marketId} (backoff until ${new Date(retryAt).toISOString()})`);
    }
    return false;
  }
  // v16 (H3): parse-failure LRU check. v15 only ran the check for markets
  // that had been seen before (attemptCount > 0); v16 always checks. The
  // v15 gate was a perf shortcut: a fresh market can't possibly be in the
  // cache, so the check is wasted work. But with v16's persistent LRU
  // (survives restarts) the gate is wrong — a fresh market that survives a
  // relayer restart is a fresh market only from the relayer's view; the
  // chain still has the cached URL from a previous run. The cost of the
  // always-on check is one extra view call per market, which is dwarfed by
  // the wasted parse-failure-resubmit cycle it prevents.
  const context = await fetchContextForMarket(marketId);
  if (context && isUrlInParseFailureCache(context.resolutionSource)) {
    // v63 (H1): track seeded markets whose URL is in the parse-failure
    // LRU so the operator can see stranded seed money. The relayer
    // can't recover the seed while the URL is cached, but
    // observation lets the operator know how much STT is locked and
    // when the LRU evicts the URL (the next tick logs an advisory
    // and re-attempts resolution). The Map is bounded by the
    // seededMarkets Set size, so it can't grow unbounded.
    if (seededMarkets.has(key) && !strandedSeedMarkets.has(key)) {
      strandedSeedMarkets.set(key, context.resolutionSource);
      saveStrandedSeeds(); // v64 (M0): persist for the dApp's /stranded-seeds endpoint
      console.warn(
        `[relayer] stranded seed: market ${marketId} URL is in parse-failure cache ` +
          `(seed 0.02 STT locked until LRU eviction in ≤1h)`,
      );
    }
    if (VERBOSE) {
      console.log(`[relayer]   skipping market ${marketId} (URL in parse-failure cache)`);
    }
    return false;
  }
  const attempts = attemptCount.get(key) ?? 0;
  if (attempts >= MAX_ATTEMPTS_PER_MARKET) {
    if (VERBOSE) {
      console.warn(
        `[relayer] market ${marketId} reached max attempts (${MAX_ATTEMPTS_PER_MARKET}); ` +
          `giving up until relayer restart. Contract may be underfunded — refill or restart.`,
      );
    }
    return false;
  }
  alreadySubmitted.add(key);
  try {
    // Re-read on every submission so a freshly-drained contract (e.g. by a
    // successful resolution earlier in the same tick) doesn't get an inflated
    // topUp from a stale read. The contract auto-refunds any over-send, so
    // this is just for accuracy.
    const topUp = await readTopUp();
    if (topUp > maxWei) {
      console.warn(
        `[relayer] market ${marketId} needs ${formatEther(topUp)} STT top-up, exceeds cap`,
      );
      return false;
    }

    const hash = await walletClient.writeContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'requestResolution',
      args: [marketId],
      value: topUp,
    });
    attemptCount.set(key, attempts + 1);
    // v15: schedule the next retry attempt at BASE_BACKOFF_MS * 2^attempts
    // (capped at MAX_BACKOFF_MS). This gates same-instance retries on the
    // relayer's tick loop, so a transient RPC failure doesn't get retried
    // on every 30s tick for the full MAX_ATTEMPTS_PER_MARKET budget.
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
    nextRetryAt.set(key, Date.now() + backoff);
    if (VERBOSE) {
      console.log(
        `[relayer]   submitted requestResolution(${marketId}) → ${hash} ` +
          `(attempt ${attempts + 1}/${MAX_ATTEMPTS_PER_MARKET}, next retry in ${Math.round(backoff / 1000)}s)`,
      );
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (VERBOSE) {
      console.log(`[relayer]   confirmed in block ${receipt.blockNumber} (status ${receipt.status})`);
    }
    if (receipt.status === 'success') {
      // The market either moved to Resolving (in-flight resolution) or rolled
      // back to Open on inner failure. Either way the previous attempt budget
      // is no longer meaningful — clear it so a future stuck-then-reset market
      // gets a fresh budget. Also clear the backoff gate.
      attemptCount.delete(key);
      nextRetryAt.delete(key);
    }
    return receipt.status === 'success';
  } catch (err) {
    attemptCount.set(key, attempts + 1);
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempts + 1), MAX_BACKOFF_MS);
    nextRetryAt.set(key, Date.now() + backoff);
    console.error(
      `[relayer]   requestResolution(${marketId}) failed:`,
      err.shortMessage ?? err.message,
      `(next retry in ${Math.round(backoff / 1000)}s)`,
    );
    return false;
  }
}

async function scanForRetryableMarkets(alreadySubmitted) {
  const nextId = await publicClient.readContract({
    address: CONTRACT, abi: ABI, functionName: 'nextMarketId',
  });
  if (nextId === 1n) return;

  // Paginate via the contract's own scan agent surface. MAX_AGENT_SCAN_LIMIT is 50.
  const allIds = [];
  let cursor = 1n;
  const limit = 50n;
  while (cursor < nextId) {
    const [ids, nextCursor] = await publicClient.readContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'scanResolvableMarkets',
      args: [cursor, limit],
    });
    allIds.push(...ids);
    if (nextCursor <= cursor || nextCursor >= nextId) break;
    cursor = nextCursor;
  }

  if (VERBOSE) {
    console.log(`[relayer] scanned ${nextId - 1n} markets via scanResolvableMarkets, ${allIds.length} resolvable`);
  }
  for (const id of allIds) {
    if (alreadySubmitted.has(marketKey(id))) continue;
    console.log(`[relayer] retrying market ${id}`);
    await tryResolveMarket(id, alreadySubmitted);
  }
}

async function drainFailureEvents(alreadySubmitted) {
  const head = await publicClient.getBlockNumber();
  if (head < lastScannedBlock) {
    // Chain reorg or RPC reset; resync to a safe margin.
    lastScannedBlock = head - 10n;
    return;
  }
  const fromBlock = lastScannedBlock + 1n;
  const toBlock = head;
  if (fromBlock > toBlock) return;

  let logs;
  try {
    logs = await getLogsChunked(CONTRACT, fromBlock, toBlock);
  } catch (err) {
    // Do NOT advance lastScannedBlock — retrying next tick from the same cursor
    // is the only way to recover. Without this guard, a single bad RPC range
    // would wedge the relayer permanently.
    console.error('[relayer] getLogs failed (will retry next tick):', err.shortMessage ?? err.message);
    return;
  }

  const failedLogs = logs.filter(
    (l) => l.topics[0]?.toLowerCase() === RESOLUTION_FAILED_TOPIC.toLowerCase(),
  );
  if (failedLogs.length === 0) {
    lastScannedBlock = toBlock;
    return;
  }
  console.log(
    `[relayer] saw ${failedLogs.length} ResolutionFailed event(s) between blocks ` +
      `${fromBlock}-${toBlock}`,
  );
  for (const log of failedLogs) {
    const marketId = log.topics[1];
    const requestId = log.topics[2];
    if (alreadySubmitted.has(marketKey(marketId))) continue;
    // Decode the non-indexed (stage, status) tuple to detect ParseWebsite
    // failures specifically — those are the ones we want to cache, because
    // the same URL won't parse any better on the next attempt.
    let stage = 0;
    try {
      const decoded = decodeAbiParameters(
        [{ type: 'uint8' }, { type: 'uint8' }],
        log.data,
      );
      stage = Number(decoded[0]);
    } catch {
      // If we can't decode, fall back to retrying normally.
    }
    if (stage === 1 /* ParseWebsite */) {
      const context = await fetchContextForMarket(marketId).catch(() => null);
      if (context?.resolutionSource) {
        cacheParseFailure(context.resolutionSource);
        console.log(
          `[relayer] caching parse-failure URL for market ${marketId}: ${context.resolutionSource}`,
        );
      }
    }
    // v64 (L1): the previous "re-resolving market N" log was misleading —
    // tryResolveMarket would immediately hit the URL-in-parse-failure-
    // cache check and skip, so the action described by the log never
    // happened. The new wording makes the actual outcome clear: the
    // URL was just cached (or the stage wasn't ParseWebsite so nothing
    // changed), and the next scanForRetryableMarkets pass will re-attempt
    // if the LRU has evicted the URL. tryResolveMarket is still called
    // here for the non-ParseWebsite failure case (e.g. inference-stage
    // failures where the URL isn't cached), but the log no longer
    // overpromises.
    console.log(
      stage === 1
        ? `[relayer] market ${marketId} parse-failure cached; next scan will retry once LRU evicts URL`
        : `[relayer] re-resolving market ${marketId} after failure (requestId ${requestId}, stage=${stage})`,
    );
    await tryResolveMarket(marketId, alreadySubmitted);
  }
  lastScannedBlock = toBlock;
}

// v16 (M1): route InferenceUnderfunded events to retryInferenceFromCache.
// v15 drained the same logs as ResolutionFailed (which re-runs the full
// requestResolution path — parse + infer), wasting the parse work the
// contract just did. v16 listens for the dedicated InferenceUnderfunded
// event and calls the cached-result path that only spends the inference
// deposit. Uses its own cursor so it's not coupled to drainFailureEvents
// (the two events are independent — InferenceUnderfunded doesn't fire on
// the same path as ResolutionFailed, since the contract reverts the latter
// to Open BEFORE the former can be emitted under v16).
let lastScannedInferenceBlock = await publicClient.getBlockNumber();

// v56 (L0): paginated cursor for scanStuckGenerationRequests. The contract
// walks [1, lastGenerationRequestId] in 50-id steps, so on a long-lived
// chain with ~5.85M generation requests, a full walk is ~117k readContract
// calls. We cap each tick to 1000 ids and resume from the saved cursor
// on the next tick — same shape as the existing event-drain cursor
// pattern (`lastScannedBlock`, `lastScannedInferenceBlock`).
let drainGenerationRequestsScanCursor = 0n;

async function drainInferenceUnderfundedEvents(alreadySubmitted) {
  const head = await publicClient.getBlockNumber();
  if (head < lastScannedInferenceBlock) {
    lastScannedInferenceBlock = head - 10n;
    return;
  }
  const fromBlock = lastScannedInferenceBlock + 1n;
  const toBlock = head;
  if (fromBlock > toBlock) return;

  let logs;
  try {
    logs = await getLogsChunked(CONTRACT, fromBlock, toBlock);
  } catch (err) {
    console.error('[relayer] getLogs (inference-underfunded) failed (will retry next tick):', err.shortMessage ?? err.message);
    return;
  }

  const underfundedLogs = logs.filter(
    (l) => l.topics[0]?.toLowerCase() === INFERENCE_UNDERFUNDED_TOPIC.toLowerCase(),
  );
  if (underfundedLogs.length === 0) {
    lastScannedInferenceBlock = toBlock;
    return;
  }
  console.log(
    `[relayer] saw ${underfundedLogs.length} InferenceUnderfunded event(s) between blocks ` +
      `${fromBlock}-${toBlock}`,
  );
  for (const log of underfundedLogs) {
    const marketId = log.topics[1];
    if (alreadySubmitted.has(marketKey(marketId))) continue;
    await tryRetryInferenceFromCache(marketId, alreadySubmitted);
  }
  lastScannedInferenceBlock = toBlock;
}

// v62 (M0): relayer-driven auto-liquidity. Watches for fresh
// MarketCreated events and seeds a YES+NO bet (RELAYER_LIQUIDITY_STT
// per side) on each new market. Mirrors the drainInferenceUnderfundedEvents
// shape (read cursor, scan, filter, advance, rollback on regression).
// The per-tick cap LIQUIDITY_SEED_MAX_PER_TICK bounds the burst case
// (a fresh contract redeploy with 50 historical markets) so the
// relayer EOA doesn't drain in a single 30s window.
async function drainSeedEvents(alreadySubmitted) {
  if (RELAYER_LIQUIDITY_STT === '0') return; // feature disabled, fast-path
  const head = await publicClient.getBlockNumber();
  if (lastScannedSeedBlock === 0n) {
    // First tick after startup — initialize the cursor to head so we
    // don't try to seed every historical market on first boot (which
    // would burn STT on markets that already have user bets and may
    // even be resolved).
    lastScannedSeedBlock = head;
    return;
  }
  if (head < lastScannedSeedBlock) {
    // Chain reorg or RPC reset; resync to a safe margin.
    lastScannedSeedBlock = head - 10n;
    return;
  }
  const fromBlock = lastScannedSeedBlock + 1n;
  const toBlock = head;
  if (fromBlock > toBlock) return;

  let logs;
  try {
    logs = await getLogsChunked(CONTRACT, fromBlock, toBlock);
  } catch (err) {
    console.error('[relayer] getLogs (seed events) failed (will retry next tick):', err.shortMessage ?? err.message);
    return;
  }

  const createdLogs = logs.filter(
    (l) => l.topics[0]?.toLowerCase() === MARKET_CREATED_TOPIC.toLowerCase(),
  );
  if (createdLogs.length === 0) {
    lastScannedSeedBlock = toBlock;
    return;
  }
  console.log(
    `[relayer] saw ${createdLogs.length} MarketCreated event(s) between blocks ` +
      `${fromBlock}-${toBlock} (capping at ${LIQUIDITY_SEED_MAX_PER_TICK}/tick)`,
  );
  let seededThisTick = 0;
  for (const log of createdLogs) {
    if (seededThisTick >= LIQUIDITY_SEED_MAX_PER_TICK) {
      console.log(
        `[relayer]   reached LIQUIDITY_SEED_MAX_PER_TICK=${LIQUIDITY_SEED_MAX_PER_TICK}; remaining markets deferred to next tick`,
      );
      break;
    }
    const marketId = log.topics[1];
    const key = marketKey(marketId);
    if (alreadySubmitted.has(key)) continue;
    if (seededMarkets.has(key)) continue;
    const ok = await seedMarket(marketId);
    if (ok) {
      alreadySubmitted.add(key);
      seededThisTick++;
    }
  }
  lastScannedSeedBlock = toBlock;
}

// v65 (H0): backfill pass for markets that were created BEFORE the
// v62 auto-seed feature was enabled. The v62 relayer initialized
// lastScannedSeedBlock to `head` on first tick, so any MarketCreated
// event that fired before that block was missed. On the live
// contract, 8 markets (4, 5, 6, 7, 8, 9, 10, 11) lack the relayer
// seed because they were created during the v60/v61 era when the
// auto-seed feature didn't exist. This function scans [1,
// nextMarketId) and calls seedMarket for any Open market where the
// relayer EOA hasn't already placed the YES+NO seed. Idempotent
// (seedMarket dedups via seededMarkets Set + getMarketBets check),
// safe to run on every relayer restart. Runs ONCE per process
// (gated by hasBackfilled flag).
async function backfillSeededMarkets(alreadySubmitted) {
  if (hasBackfilled) return;
  if (RELAYER_LIQUIDITY_STT === '0') {
    // Auto-seed disabled — skip the backfill entirely. The
    // operator opted out of the feature.
    hasBackfilled = true;
    return;
  }
  hasBackfilled = true;
  let nextId;
  try {
    nextId = await publicClient.readContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'nextMarketId',
    });
  } catch (err) {
    console.warn(
      '[relayer] backfill: failed to read nextMarketId (skipping):',
      err.shortMessage ?? err.message,
    );
    return;
  }
  if (nextId <= 1n) return;
  const total = Number(nextId - 1n);
  console.log(
    `[relayer] backfill: scanning ${total} historical market(s) for missing seeds`,
  );
  let backfilledCount = 0;
  for (let id = 1n; id < nextId; id++) {
    try {
      const market = await publicClient.readContract({
        address: CONTRACT,
        abi: ABI,
        functionName: 'getMarket',
        args: [id],
      });
      // Skip non-Open markets (Resolved/Resolving don't need
      // seeds — the relayer would have either claimed or be mid-
      // flight).
      if (Number(market.status) !== 0) continue;
      // Skip markets that don't end yet (no point seeding a
      // market that won't resolve for hours).
      if (BigInt(market.endTime) * 1000n <= BigInt(Date.now())) continue;
      // Skip markets the relayer already seeded (seededMarkets
      // Set is the canonical source of truth, persisted to disk).
      if (seededMarkets.has(marketKey(id))) continue;
      // Check if the relayer EOA has both YES and NO bets on this
      // market. If so, the seed is already in place.
      const bets = await publicClient.readContract({
        address: CONTRACT,
        abi: ABI,
        functionName: 'getMarketBets',
        args: [id],
      }).catch(() => []);
      const relayerLower = account.address.toLowerCase();
      const hasYes = bets.some(
        (b) => b.better.toLowerCase() === relayerLower && Number(b.option) === 0,
      );
      const hasNo = bets.some(
        (b) => b.better.toLowerCase() === relayerLower && Number(b.option) === 1,
      );
      if (hasYes && hasNo) {
        // Seed is in place but the relayer's seededMarkets Set
        // didn't know — backfill the Set without re-seeding.
        seededMarkets.add(marketKey(id));
        saveSeededMarkets();
        continue;
      }
      // Place the seed (or complete the partial seed if one side
      // is already present).
      const ok = await seedMarket(id);
      if (ok) {
        alreadySubmitted.add(marketKey(id));
        backfilledCount++;
      }
    } catch (err) {
      console.warn(
        `[relayer] backfill: market ${id} check failed:`,
        err.shortMessage ?? err.message,
      );
      // Continue with the next market — one bad market shouldn't
      // abort the backfill.
    }
  }
  if (backfilledCount > 0) {
    console.log(
      `[relayer] backfill: seeded ${backfilledCount} historical market(s) that were missed by the initial v62 cursor skip`,
    );
  } else {
    console.log(
      '[relayer] backfill: no missing seeds found',
    );
  }
}

// v62 (M0): place the YES+NO seed bets. Returns true on full success
// (both bets mined), false otherwise. The seededMarkets Set is updated
// ONLY after both bets have receipts with status='success' — a partial
// seed (e.g. YES mined, NO reverted) is NOT recorded, so the next
// relayer restart will retry. The retry cost is bounded by
// LIQUIDITY_SEED_MAX_PER_TICK per tick, so a single market getting
// re-seeded costs ~0.02 STT — acceptable for the demo.
// v66 (M0): seedMarket no longer adds to seededMarkets if the relayer
// EOA already has both YES and NO bets on this market (idempotent
// re-seeding guard). The backfill was hitting a subtle bug: after
// the backfill seeded markets 4-11 and the v63 partial-seed logic
// picked up the missing sides, the relayer's seededMarkets Set was
// missing the "fully-seeded" markets because the backfill's
// "has both bets" check was using a stale in-memory `seededMarkets`
// Set. The next relayer restart would re-seed them, wasting
// 0.02 STT per market. Now: if both bets are already on-chain
// (per the fresh readContract result), mark the Set without
// re-sending the txs.

// v66 (M0): periodic partial-seed retry. The Somnia testnet
// has a state-trie issue where a successful tx (`status: 1` in the
// receipt) doesn't always commit the SSTOREs — most notably
// `market.noTotal += msg.value` sometimes rolls back even when
// `userNoBets[msg.sender][marketId] += msg.value` and the
// `marketBets.push` both commit. This leaves the relayer EOA with
// a "half-seed" (one side on-chain per the relayer's read, the
// other side seemingly on-chain but `noTotal = 0`). The v65 backfill
// catches this on relayer startup, but a partial seed that occurs
// AFTER the backfill would only recover on the next restart.
// v67 (L2): this function now has two paths:
//   1. flaggedPartials: a Set of markets where seedMarket returned
//      false (one side landed, the other didn't due to the
//      Somnia state-trie bug). These are retried EVERY tick
//      (not just every 30 min) so the operator sees a "partial"
//      pill for the minimum possible window. Cleared when both
//      sides land.
//   2. The full seededMarkets Set: scanned every
//      RETRY_PARTIAL_SEED_INTERVAL_TICKS (default 60 = ~30 min)
//      for any market where the relayer EOA lacks both YES + NO
//      bets, re-attempting the missing side. This catches the
//      slow case where the relayer didn't detect the partial on
//      the original attempt (e.g. the receipt said success and
//      the SOMNIA state rolled back later).
async function retryPartialSeeds(alreadySubmitted) {
  if (RELAYER_LIQUIDITY_STT === '0') return;
  // Path 1: per-tick retry of flagged partials. Bounded by
  // LIQUIDITY_SEED_MAX_PER_TICK so a single tick can't blow the
  // budget on a flood of partials.
  if (flaggedPartials.size > 0) {
    let retried = 0;
    for (const key of [...flaggedPartials]) {
      if (retried >= LIQUIDITY_SEED_MAX_PER_TICK) break;
      if (alreadySubmitted.has(key)) continue;
      let marketId;
      try {
        marketId = BigInt(key);
      } catch {
        continue;
      }
      console.log(
        `[relayer] flagged retry: market ${marketId} (every-tick retry until both sides land)`,
      );
      const ok = await seedMarket(marketId);
      if (ok) {
        flaggedPartials.delete(key);
        alreadySubmitted.add(key);
        retried++;
      } else {
        // Still partial. Keep in the flagged set, retry next tick.
        // v67 (L2): bound the retry budget — a stuck partial should
        // not retry forever. After 60 attempts (60 ticks = 30 min at
        // 30s POLL_MS), drop the market from the flagged set and
        // log an advisory. The relayer's main loop will still
        // process the market via the regular resolution path
        // (tryResolveMarket) once the market expires.
        const attempts = (flaggedPartials.get(key)?.attempts ?? 0) + 1;
        if (attempts >= 60) {
          flaggedPartials.delete(key);
          console.warn(
            `[relayer] flagged retry: market ${marketId} gave up after 60 attempts (Somnia state-trie bug is unfixable from the relayer side)`,
          );
        } else {
          flaggedPartials.set(key, { attempts });
        }
      }
    }
  }
  // Path 2: every-30-min full scan (catches the slow path).
  if (tickCount % RETRY_PARTIAL_SEED_INTERVAL_TICKS !== 0) return;
  if (seededMarkets.size === 0) return;
  let retried = 0;
  for (const key of seededMarkets) {
    if (retried >= LIQUIDITY_SEED_MAX_PER_TICK) break;
    if (alreadySubmitted.has(key)) continue;
    let marketId;
    try {
      marketId = BigInt(key);
    } catch {
      continue;
    }
    try {
      const bets = await publicClient.readContract({
        address: CONTRACT,
        abi: ABI,
        functionName: 'getMarketBets',
        args: [marketId],
      });
      const relayerLower = account.address.toLowerCase();
      const hasYes = bets.some(
        (b) => b.better.toLowerCase() === relayerLower && Number(b.option) === 0,
      );
      const hasNo = bets.some(
        (b) => b.better.toLowerCase() === relayerLower && Number(b.option) === 1,
      );
      if (hasYes && hasNo) continue; // already fully seeded
      // v67 (L2): the slow-path retry uses the regular seedMarket,
      // which returns false on partial. Add to flaggedPartials so
      // the per-tick retry handles it from now on.
      console.log(
        `[relayer] slow-path retry: market ${marketId} partial seed (has yes=${hasYes}, no=${hasNo}); re-attempting`,
      );
      const ok = await seedMarket(marketId);
      if (ok) {
        alreadySubmitted.add(key);
        retried++;
      } else if (!flaggedPartials.has(key)) {
        flaggedPartials.add(key, { attempts: 0 });
      }
    } catch (err) {
      console.warn(
        `[relayer] periodic retry: market ${marketId} check failed:`,
        err.shortMessage ?? err.message,
      );
    }
  }
  if (retried > 0) {
    console.log(
      `[relayer] periodic retry: completed ${retried} partial seed(s)`,
    );
  }
}

async function seedMarket(marketId) {
  const key = marketKey(marketId);
  if (seededMarkets.has(key)) return false;
  const seedWei = parseEther(RELAYER_LIQUIDITY_STT);
  if (seedWei < minBetWei) {
    console.warn(
      `[relayer]   skipping seed for market ${marketId}: RELAYER_LIQUIDITY_STT=${RELAYER_LIQUIDITY_STT} is below MIN_BET (${formatEther(minBetWei)} STT)`,
    );
    return false;
  }
  // v63 (M2): partial-seed completion. Read the market's bet array
  // first — if the relayer EOA already has a YES or NO bet on this
  // market (e.g. a prior seedMarket attempt placed YES but NO reverted
  // because the relayer EOA ran out of STT between txs, or the RPC
  // dropped mid-sequence), only place the missing side. Without this
  // check, a retry would double-up the side that already landed,
  // wasting ~0.01 STT per failed-NO event. Read is bounded by the
  // marketBets array length (typically <10 bets at demo scale) so
  // the RPC cost is negligible. The `hasYesRelayer` / `hasNoRelayer`
  // checks use the option field directly — the relayer EOA's
  // address is matched against marketBets[i].better.
  const existingBets = await publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'getMarketBets',
    args: [marketId],
  }).catch(() => []);
  const relayerAddrLower = account.address.toLowerCase();
  const hasYesRelayer = existingBets.some(
    (b) => b.better.toLowerCase() === relayerAddrLower && Number(b.option) === 0 /* Yes */,
  );
  const hasNoRelayer = existingBets.some(
    (b) => b.better.toLowerCase() === relayerAddrLower && Number(b.option) === 1 /* No */,
  );
  const optionsToPlace = [];
  if (!hasYesRelayer) optionsToPlace.push(0 /* Yes */);
  if (!hasNoRelayer) optionsToPlace.push(1 /* No */);
  if (optionsToPlace.length === 0) {
    // Both bets already on-chain (shouldn't happen because seededMarkets
    // gates entry, but defensive). Mark as seeded and move on.
    seededMarkets.add(key);
    saveSeededMarkets();
    return true;
  }
  if (optionsToPlace.length < 2) {
    console.log(
      `[relayer]   completing partial seed for market ${marketId} (already has ${hasYesRelayer ? 'YES' : 'NO'})`,
    );
  } else {
    console.log(
      `[relayer]   seeding market ${marketId} (${RELAYER_LIQUIDITY_STT} STT each side, total ${Number(RELAYER_LIQUIDITY_STT) * 2} STT)`,
    );
  }
  for (const option of optionsToPlace) {
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT,
        abi: ABI,
        functionName: 'bet',
        args: [marketId, option],
        value: seedWei,
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 60_000,
      });
      if (receipt.status !== 'success') {
        console.error(
          `[relayer]   seed bet for market ${marketId} option=${option} reverted (blockHash=${receipt.blockHash}); aborting pair`,
        );
        // v67 (L2): flag the market for per-tick retry. The receipt
        // says "reverted" but the on-chain state may be inconsistent
        // (Somnia state-trie); the next per-tick retry will re-read
        // and either complete the seed or confirm the revert.
        flaggedPartials.set(key, { attempts: 0 });
        return false;
      }
      if (VERBOSE) {
        console.log(
          `[relayer]   seed bet mined: market ${marketId} option=${option} → ${hash}`,
        );
      }
    } catch (err) {
      console.error(
        `[relayer]   seed bet for market ${marketId} option=${option} failed:`,
        err.shortMessage ?? err.message,
      );
      // v67 (L2): flag for per-tick retry. The error might be a
      // transient RPC issue (network blip, node restart) that the
      // next tick resolves. A permanent failure (e.g. contract
      // paused) will hit the 60-attempt cap and self-clear.
      flaggedPartials.set(key, { attempts: 0 });
      return false;
    }
  }
  seededMarkets.add(key);
  saveSeededMarkets(); // sync write (v32 H1 pattern) — SIGKILL here costs 0.02 STT
  console.log(
    `[relayer]   seeded market ${marketId} (${RELAYER_LIQUIDITY_STT} STT each side)`,
  );
  return true;
}

// v63 (H1): stranded-seed eviction detector. Each tick, scan the
// strandedSeedMarkets Map. For any market whose URL is no longer in
// the parse-failure LRU (TTL expired or FIFO size eviction), log an
// advisory and remove the entry — the next scanForRetryableMarkets
// pass will then re-attempt resolution via the normal tryResolveMarket
// path. This is observability + a passive retry, not an active one:
// the operator sees the "[relayer] stranded seed recovered" line and
// knows the relayer is no longer holding the seed money hostage. The
// function is a fast no-op when strandedSeedMarkets is empty (the
// common case in steady state).
async function drainStrandedSeeds() {
  if (strandedSeedMarkets.size === 0) return;
  const now = Date.now();
  for (const [key, url] of strandedSeedMarkets) {
    const k = urlKey(url);
    const expiresAt = parseFailureCache.get(k);
    const stillCached =
      expiresAt !== undefined && expiresAt > now;
    if (!stillCached) {
      // Either expired (TTL) or evicted (FIFO size). Look up the
      // marketId from the key (reverse of marketKey).
      const marketId = BigInt(key);
      console.log(
        `[relayer] stranded seed recovered: market ${marketId} URL no longer in parse-failure cache; will retry on next scan`,
      );
      strandedSeedMarkets.delete(key);
      saveStrandedSeeds(); // v64 (M0): persist the eviction for the dApp
    }
  }
}

async function tryRetryInferenceFromCache(marketId, alreadySubmitted) {
  const key = marketKey(marketId);
  if (alreadySubmitted.has(key)) {
    if (VERBOSE) console.log(`[relayer]   skipping market ${marketId} (already queued this tick)`);
    return false;
  }
  // Same backoff gate as tryResolveMarket — transient RPC failures on the
  // retry path shouldn't get hammered on every 30s tick.
  const retryAt = nextRetryAt.get(key);
  if (retryAt !== undefined && retryAt > Date.now()) {
    if (VERBOSE) {
      console.log(`[relayer]   skipping market ${marketId} (inference-retry backoff until ${new Date(retryAt).toISOString()})`);
    }
    return false;
  }
  // v17 (M2): pre-check the on-chain cache. retryInferenceFromCache reverts
  // InferenceNotCached if the parse callback never wrote a result
  // (e.g. parse callback itself failed — ResolutionFailed was emitted
  // before the cache was populated). Burning a tx + an attempt-slot on a
  // guaranteed revert is wasteful, so skip silently and let the operator
  // investigate the parse failure separately.
  // v18 (H1): the contract getter returns a plain JS `string` (the storage
  // is `mapping(uint256 => string) public marketParseResult`). The v17
  // check used `length > 2` which was wrong for the `string` return —
  // empty is `''` (length 0), not `'0x'` (length 2). A 1-2 char cache
  // (rare in practice — parse results are typically 50-500 chars) would
  // have been incorrectly treated as empty.
  let hasCachedParse = false;
  try {
    const cached = await publicClient.readContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'marketParseResult',
      args: [marketId],
    });
    if (typeof cached === 'string') {
      hasCachedParse = cached.length > 0;
    } else if (cached instanceof Uint8Array) {
      hasCachedParse = cached.length > 0;
    } else if (cached && typeof cached === 'object' && 'length' in cached) {
      hasCachedParse = Number(cached.length) > 0;
    }
  } catch (err) {
    // Fall through — if the pre-check RPC fails, let the contract be the
    // source of truth (and the attempt counter is unaffected since we
    // haven't called writeContract yet).
    if (VERBOSE) {
      console.warn(
        `[relayer]   pre-check marketParseResult(${marketId}) failed:`,
        err.shortMessage ?? err.message,
      );
    }
  }
  if (!hasCachedParse) {
    if (VERBOSE) {
      console.log(
        `[relayer]   skipping market ${marketId} (no cached parse result — retry would revert InferenceNotCached)`,
      );
    }
    return false;
  }
  const attempts = attemptCount.get(key) ?? 0;
  if (attempts >= MAX_ATTEMPTS_PER_MARKET) {
    if (VERBOSE) {
      console.warn(
        `[relayer] market ${marketId} reached max attempts (${MAX_ATTEMPTS_PER_MARKET}); ` +
          `giving up inference-cache retry until relayer restart.`,
      );
    }
    return false;
  }
  alreadySubmitted.add(key);
  try {
    const topUp = await readInferenceTopUp();
    if (topUp > maxWei) {
      console.warn(
        `[relayer] market ${marketId} needs ${formatEther(topUp)} STT inference top-up, exceeds cap`,
      );
      return false;
    }
    const hash = await walletClient.writeContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'retryInferenceFromCache',
      args: [marketId],
      value: topUp,
    });
    attemptCount.set(key, attempts + 1);
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
    nextRetryAt.set(key, Date.now() + backoff);
    if (VERBOSE) {
      console.log(
        `[relayer]   submitted retryInferenceFromCache(${marketId}) → ${hash} ` +
          `(attempt ${attempts + 1}/${MAX_ATTEMPTS_PER_MARKET}, next retry in ${Math.round(backoff / 1000)}s)`,
      );
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (VERBOSE) {
      console.log(`[relayer]   confirmed in block ${receipt.blockNumber} (status ${receipt.status})`);
    }
    if (receipt.status === 'success') {
      attemptCount.delete(key);
      nextRetryAt.delete(key);
    }
    return receipt.status === 'success';
  } catch (err) {
    attemptCount.set(key, attempts + 1);
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempts + 1), MAX_BACKOFF_MS);
    nextRetryAt.set(key, Date.now() + backoff);
    console.error(
      `[relayer]   retryInferenceFromCache(${marketId}) failed:`,
      err.shortMessage ?? err.message,
      `(next retry in ${Math.round(backoff / 1000)}s)`,
    );
    return false;
  }
}

async function logResolvedMarkets() {
  // Cheap side-effect: log when a market actually resolves, so the operator can see the loop closed.
  const head = await publicClient.getBlockNumber();
  const from = head > 50n ? head - 50n : 0n;
  const logs = await getLogsChunked(CONTRACT, from, head).catch((err) => {
    console.error('[relayer] getLogs (logResolved) failed:', err.shortMessage ?? err.message);
    return [];
  });
  const resolved = logs.filter(
    (l) => l.topics[0]?.toLowerCase() === MARKET_RESOLVED_TOPIC.toLowerCase(),
  );
  for (const log of resolved) {
    const key = marketKey(log.topics[1]);
    // v33 (H0): module-level dedup so a market that resolved at block N isn't
    // re-logged on every tick for the next 50 blocks (~25 min). Same pattern
    // as seenGenerationFailures (L212). FIFO eviction when at the cap so the
    // Set doesn't grow unbounded on a long-running relayer.
    if (seenResolvedMarkets.has(key)) continue;
    if (seenResolvedMarkets.size >= SEEN_RESOLVED_LIMIT) {
      const oldest = seenResolvedMarkets.values().next().value;
      seenResolvedMarkets.delete(oldest);
    }
    seenResolvedMarkets.add(key);
    // v37 (H0): decode outcome from log.data, not log.topics[2]. The
    // contract event is `MarketResolved(uint256 indexed marketId, bool
    // outcome, string reason, uint256 timestamp)` — only marketId is
    // indexed, so log.topics = [sig, marketId] and log.topics[2] is
    // undefined. Pre-v37, BigInt(undefined) threw on every resolved
    // market, the throw was caught by the main loop's try/catch at
    // L1339, and the operator saw `[relayer] loop error: ...` instead
    // of the "market N resolved outcome=YES" log. The try/catch kept
    // the relayer alive but suppressed the operator's primary signal
    // that the autonomous pipeline actually completed. Decode the
    // outcome from the ABI-encoded (bool, string, uint256) in
    // log.data using the same decodeAbiParameters pattern that
    // drainFailureEvents (L684) and drainGenerationFailureEvents
    // (L1093) already use.
    let outcome = 'NO';
    try {
      const decoded = decodeAbiParameters(
        [{ type: 'bool' }, { type: 'string' }, { type: 'uint256' }],
        log.data,
      );
      outcome = decoded[0] ? 'YES' : 'NO';
    } catch {
      // Malformed log (truncated, wrong shape) — default to NO and
      // let the operator investigate via the receipt URL.
    }
    console.log(`[relayer] ✓ market ${log.topics[1]} resolved outcome=${outcome}`);
    // v62 (M0): if we seeded this market, claim the winnings back. The
    // relayer's YES+NO seed bet lands in marketBets[marketId] like any
    // other bet, so claimWinnings pays out the relayer's share of the
    // winning side (proportional to its 0.01 STT stake vs. the
    // winningPool). If the relayer's side lost (or the market had no
    // other bettors — the relayer gets 0.02 STT back, its 0.01 stake
    // on the losing side forfeit), claimWinnings reverts NoWinningBets
    // and we add the market to seenClaimedMarkets so we don't retry
    // every tick. The outcome is logged as an advisory so the operator
    // can see "the relayer's seed was recovered" or "the relayer's
    // side lost, seed forfeit" without digging through receipt URLs.
    // v63 (L1): the env-toggle foot-gun fix. v62 gated the claim on
    // `RELAYER_LIQUIDITY_STT !== '0'`, but if the operator toggles the
    // env var from '0.01' to '0' mid-flight (without restart), the
    // in-memory seededMarkets Set still has the marketId — but the
    // claim block would skip, stranding the seed money. v63 drops
    // the env-gate; the check is now purely on `seededMarkets.has(key)`
    // (the operator manually editing the relayer to remove an entry
    // from the on-disk file is the only way to disable the claim for
    // a specific market).
    if (seededMarkets.has(key) && !seenClaimedMarkets.has(key)) {
      if (seenClaimedMarkets.size >= SEEN_CLAIMED_LIMIT) {
        const oldest = seenClaimedMarkets.values().next().value;
        seenClaimedMarkets.delete(oldest);
      }
      seenClaimedMarkets.add(key);
      try {
        const hash = await walletClient.writeContract({
          address: CONTRACT,
          abi: ABI,
          functionName: 'claimWinnings',
          args: [log.topics[1]],
        });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          timeout: 60_000,
        });
        if (receipt.status === 'success') {
          saveClaimedMarkets();
          console.log(
            `[relayer]   claimed winnings for market ${log.topics[1]} → ${hash}`,
          );
        } else {
          console.error(
            `[relayer]   claimWinnings(${log.topics[1]}) reverted (blockHash=${receipt.blockHash}); relayer EOA had no winning bet, seed forfeit`,
          );
        }
      } catch (err) {
        // NoWinningBets reverts when the relayer's side lost (or the
        // user already claimed). Catch + advisory log so the operator
        // can audit. The seenClaimedMarkets.add above ensures we
        // don't retry every tick.
        const reason = err.shortMessage ?? err.message ?? '';
        if (/NoWinningBets/i.test(reason)) {
          console.log(
            `[relayer]   market ${log.topics[1]} resolved ${outcome}; relayer EOA had no winning bet (seed forfeit on losing side)`,
          );
        } else {
          console.error(
            `[relayer]   claimWinnings(${log.topics[1]}) failed:`,
            reason,
          );
        }
      }
    }
  }
}

async function tryResetStuckMarket(marketId, alreadySubmitted) {
  const key = marketKey(marketId);
  if (alreadySubmitted.has(key)) return false;

  // v14: cap reset attempts per market. A reset that fails 3 ticks in a row
  // means either the RPC keeps rejecting writes or the contract reverts on the
  // staleness check — neither is helped by hammering. Restart the relayer once
  // the underlying issue is fixed to clear the budget.
  const resetKey = `reset:${key}`;
  const resetAttempts = resetAttemptCount.get(resetKey) ?? 0;
  if (resetAttempts >= RESET_MAX_ATTEMPTS) {
    if (VERBOSE) {
      console.warn(
        `[relayer] forceResetMarket(${marketId}) reached max attempts ` +
          `(${RESET_MAX_ATTEMPTS}); giving up until relayer restart.`,
      );
    }
    return false;
  }

  alreadySubmitted.add(key);
  try {
    const hash = await walletClient.writeContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'forceResetMarket',
      args: [marketId],
    });
    resetAttemptCount.set(resetKey, resetAttempts + 1);
    console.log(
      `[relayer]   forceResetMarket(${marketId}) → ${hash} (recovered stuck market, ` +
        `attempt ${resetAttempts + 1}/${RESET_MAX_ATTEMPTS})`,
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'success') {
      // The market is now Open again — clear any per-market attempt count so
      // the next requestResolution call gets a fresh budget. Also clear the
      // reset budget since the recovery worked. v19 (H3): also clear
      // nextRetryAt — without this, a previous failed resolution attempt's
      // backoff window (up to 30 min) gates the next requestResolution call
      // even though the market is now freshly Open. tryResolveMarket and
      // tryRetryInferenceFromCache both clear nextRetryAt on success; this
      // was the only path that didn't.
      attemptCount.delete(key);
      resetAttemptCount.delete(resetKey);
      nextRetryAt.delete(key);
    }
    return receipt.status === 'success';
  } catch (err) {
    resetAttemptCount.set(resetKey, resetAttempts + 1);
    console.error(
      `[relayer]   forceResetMarket(${marketId}) failed:`,
      err.shortMessage ?? err.message,
    );
    return false;
  }
}

async function tryResetStuckGeneration(requestId, alreadySubmitted) {
  // Unlike tryResetStuckMarket, the request id (not a market id) is the key —
  // the generation pipeline has no associated market. Idempotent: the contract
  // reverts GenerationNotStuck if the request is fresh or already cleared.
  const key = marketKey(requestId);
  if (alreadySubmitted.has(key)) return false;

  // v14: same per-request reset cap as tryResetStuckMarket. Generation resets
  // are advisory (no associated market to unblock for users); if they keep
  // failing the operator should investigate rather than the relayer retrying.
  const resetKey = `resetgen:${key}`;
  const resetAttempts = resetAttemptCount.get(resetKey) ?? 0;
  if (resetAttempts >= RESET_MAX_ATTEMPTS) {
    if (VERBOSE) {
      console.warn(
        `[relayer] forceResetGeneration(${requestId}) reached max attempts ` +
          `(${RESET_MAX_ATTEMPTS}); giving up until relayer restart.`,
      );
    }
    return false;
  }

  alreadySubmitted.add(key);
  try {
    const hash = await walletClient.writeContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'forceResetGeneration',
      args: [requestId],
    });
    resetAttemptCount.set(resetKey, resetAttempts + 1);
    console.log(
      `[relayer]   forceResetGeneration(${requestId}) → ${hash} (recovered stuck generation, ` +
        `attempt ${resetAttempts + 1}/${RESET_MAX_ATTEMPTS})`,
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'success') {
      console.warn(
        `[relayer]   note: inference deposit for request ${requestId} was forwarded to the platform at request time and is not refundable.`,
      );
      resetAttemptCount.delete(resetKey);
    }
    return receipt.status === 'success';
  } catch (err) {
    resetAttemptCount.set(resetKey, resetAttempts + 1);
    console.error(
      `[relayer]   forceResetGeneration(${requestId}) failed:`,
      err.shortMessage ?? err.message,
    );
    return false;
  }
}

async function scanStuckGenerationRequests(alreadySubmitted) {
  // Paginate via the contract's own agent surface. MAX_AGENT_SCAN_LIMIT is 50.
  // The contract walks [cursor, lastGenerationRequestId] so the upper bound is
  // tight — but we have to enforce it on the client side too. v56 (L0):
  // added the upper-bound check. Pre-L0 the loop was `while (true)` with
  // only the `nextCursor <= cursor` no-progress break — which never
  // fired on a healthy chain because the contract returns
  // `nextCursor = cursor + limit` on every call. On the live v45
  // contract lastGenerationRequestId is ~5.85M, so the relayer
  // would otherwise make ~117,000 sequential readContract calls per
  // tick (~3 hours at 100ms/call). Hard-cap the per-tick scan budget
  // to SCAN_BUDGET ids and resume from the saved cursor on the next
  // tick (see `drainGenerationRequestsScanCursor` below). The cap
  // guarantees each tick finishes in seconds, not hours.
  const SCAN_BUDGET = 1000;
  const lastId = await publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'lastGenerationRequestId',
  });
  if (lastId === 0n) return;

  const startCursor = drainGenerationRequestsScanCursor > 0n
    ? drainGenerationRequestsScanCursor
    : 1n;
  const allIds = [];
  let cursor = startCursor;
  const limit = 50n;
  let scanned = 0n;
  while (cursor <= lastId && scanned < SCAN_BUDGET) {
    const [ids, nextCursor] = await publicClient.readContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'scanStuckGenerationRequests',
      args: [cursor, limit],
    });
    allIds.push(...ids);
    if (nextCursor <= cursor) break;
    cursor = nextCursor;
    scanned += limit;
  }
  // Persist the cursor for the next tick. If we finished the walk
  // (cursor > lastId), reset to 0n so the next tick starts fresh.
  drainGenerationRequestsScanCursor = cursor > lastId ? 0n : cursor;

  if (allIds.length > 0) {
    console.log(`[relayer] found ${allIds.length} stuck generation request(s); force-resetting each`);
  }
  for (const id of allIds) {
    if (alreadySubmitted.has(marketKey(id))) continue;
    await tryResetStuckGeneration(id, alreadySubmitted);
  }
}

async function drainGenerationFailureEvents() {
  // GenerationFailed is *not* auto-retried: a "wrong-selector" or
  // "no-tool-calls" failure means the proposer's topic was unsolvable by the
  // agent, which is the proposer's call to fix (and re-submit with a
  // different topic if they want). The relayer only logs so the operator can
  // see the failure rate.
  //
  // Use a small backward window (like logResolvedMarkets) rather than the
  // shared lastScannedBlock cursor — generation failures are advisory, not
  // act-on-able, so we don't need a forward-only scan with cursor advance.
  // v23 (L1): the per-tick alreadySubmitted Set was the wrong layer for
  // dedup. It's reset at the top of the main loop, so a GenerationFailed
  // event that stays in the last 50 blocks (≈50s of chain history) gets
  // logged again on every 30s tick — the operator's terminal fills with
  // duplicate warnings. The 50-block window is the only practical scan
  // range for advisory events (we don't want a forward cursor advance on a
  // log we don't act on), so the dedup has to persist across ticks.
  // FIFO-cap the Set at 1000 entries so it doesn't grow unbounded on a
  // long-running relayer with many distinct failed generation requests.
  // v24 (M1): decode the (uint8 status, string reason) data so operators
  // see the actual failure reason ("QuestionTooLong", "wrong-selector",
  // etc.) instead of just the requestId. The reason was the most useful
  // debug signal in the contract event and it was being thrown away.
  // v24 (M2): the alreadySubmitted parameter is dead. The per-tick Set was
  // reset every loop iteration, so populating it was a no-op even when the
  // dedup lived there. Now that the dedup is module-level (v23 L1), the
  // parameter has no role at all — drop it.
  const head = await publicClient.getBlockNumber();
  const from = head > 50n ? head - 50n : 0n;
  const logs = await getLogsChunked(CONTRACT, from, head).catch((err) => {
    console.error('[relayer] getLogs (generation) failed:', err.shortMessage ?? err.message);
    return [];
  });
  const failedLogs = logs.filter(
    (l) => l.topics[0]?.toLowerCase() === GENERATION_FAILED_TOPIC.toLowerCase(),
  );
  for (const log of failedLogs) {
    const key = marketKey(log.topics[1]);
    if (seenGenerationFailures.has(key)) continue;
    if (seenGenerationFailures.size >= SEEN_GEN_FAILURE_LIMIT) {
      const oldest = seenGenerationFailures.values().next().value;
      seenGenerationFailures.delete(oldest);
    }
    seenGenerationFailures.add(key);

    // Decode (uint8 status, string reason) from the non-indexed data.
    // The reason is the contract's hint to the operator (see _describeCreateRevert
    // in AutonomousPredictionMarket.sol: "QuestionTooLong", "wrong-selector",
    // "no-tool-calls", "empty-tool-calls", "create-reverted", "no-success").
    let reason = 'unknown';
    try {
      const decoded = decodeAbiParameters(
        [{ type: 'uint8' }, { type: 'string' }],
        log.data,
      );
      reason = decoded[1] || 'unknown';
    } catch {
      // Malformed log (truncated, wrong shape) — fall through to the
      // unknown reason rather than crashing the tick.
    }
    console.warn(
      `[relayer] generation request ${log.topics[1]} failed: reason=${reason} (no auto-retry; see receipt at https://agents.testnet.somnia.network/receipts/${log.topics[1]})`,
    );
  }
}

async function scanStuckMarkets(alreadySubmitted) {
  const nextId = await publicClient.readContract({
    address: CONTRACT, abi: ABI, functionName: 'nextMarketId',
  });
  if (nextId === 1n) return;

  const allIds = [];
  let cursor = 1n;
  const limit = 50n;
  while (cursor < nextId) {
    const [ids, nextCursor] = await publicClient.readContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'scanStuckMarkets',
      args: [cursor, limit],
    });
    allIds.push(...ids);
    if (nextCursor <= cursor || nextCursor >= nextId) break;
    cursor = nextCursor;
  }

  if (allIds.length > 0) {
    console.log(`[relayer] found ${allIds.length} stuck market(s); force-resetting each`);
  }
  for (const id of allIds) {
    if (alreadySubmitted.has(marketKey(id))) continue;
    await tryResetStuckMarket(id, alreadySubmitted);
  }
}

// v29 (H1): drainTopicFeed is the symmetric "trigger new creations" path to
// scanForRetryableMarkets (the trigger new resolutions path). It reads the
// configured topic feed and submits requestMarketGeneration for any topic
// not already in the submittedTopics Set. The Set is persistent, so a
// relayer restart picks up only NEW topics added to the file. This closes
// the last "human in the loop" gap in the fully-autonomous pipeline: a
// judge can see new markets appear on /proof without ever clicking
// "Invoke Generator".
//
// We bound the per-tick submission rate to TOPIC_FEED_MAX_PER_TICK (default
// 1) so a relayer that comes up after a 24h downtime doesn't fire 100
// requestMarketGeneration txs in 30s and exhaust the inference deposit
// budget. A 30s cadence means ~2880 topics/day max — far above any demo
// cadence, but the bound keeps the contract's STT balance predictable.
// v30 (H0): declaration hoisted to L167 so the startup log can reference
// it without a TDZ throw.
async function readTopicFeed() {
  try {
    const raw = await readFile(TOPICS_FILE, 'utf8');
    const topics = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#')) continue;
      if (trimmed.length > 200) continue; // MAX_TOPIC_LENGTH
      topics.push(trimmed);
    }
    return topics;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error(`[relayer] failed to read topic feed ${TOPICS_FILE}:`, err.message);
    return null; // null = error (not "no file"); caller can decide to skip vs warn
  }
}

async function drainTopicFeed() {
  const topics = await readTopicFeed();
  if (topics === null) return; // read error; already logged
  // v59 (H0): substitute `{{date}}` with today's UTC date so a
  // single template line like "Will Ethereum's L1 gas price stay
  // under 5 gwei for {{date}}?" produces a unique string each day.
  // The relayer's submittedTopics Set dedupes by full string, so
  // this is what makes "auto-created every day" work — a static
  // line would only fire once total. Substitution happens here, not
  // at file-read time, so the on-disk file stays human-readable
  // (the {{date}} placeholder is visible to anyone inspecting it).
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const expanded = topics.map((t) => t.replaceAll('{{date}}', today));
  const fresh = expanded.filter((t) => !submittedTopics.has(t));
  if (fresh.length === 0) {
    // v48 (L1): log the empty case once per tick so VERBOSE=1 operators
    // can see the feed is being polled. The pre-v48 silent return made a
    // healthy relayer's main-loop look identical to a relayer where
    // drainTopicFeed was never called — i.e. the v29 TDZ bug pattern.
    // Cheap conditional log (one line per 30s tick); no rate limiting
    // needed at TOPIC_FEED_MAX_PER_TICK cadence.
    if (topics.length === 0) {
      console.log(`[relayer] topic feed: ${TOPICS_FILE} empty (no topics submitted)`);
    } else {
      console.log(
        `[relayer] topic feed: ${topics.length} total, ${fresh.length} new (all already submitted); skipping`,
      );
    }
    return;
  }
  console.log(
    `[relayer] topic feed: ${topics.length} total (${expanded.length} after {{date}} substitution), ${fresh.length} new, ` +
      `submitting up to ${TOPIC_FEED_MAX_PER_TICK}`,
  );
  const slice = fresh.slice(0, TOPIC_FEED_MAX_PER_TICK);
  for (const topic of slice) {
    // v30 (H1): pre-flight checks FIRST, then add to the Set, then submit.
    // The pre-v30 order (set add → read topUp → cap check → continue) meant
    // a transient cap-exceedance or a transient RPC blip on readInferenceTopUp
    // would permanently add the topic to submittedTopics — the next relayer
    // tick wouldn't retry, the operator would have to hand-edit
    // SUBMITTED_TOPICS_FILE. Now pre-flight failures keep the topic out of
    // the Set entirely (it'll be retried on the next tick once the operator
    // raises the cap or the RPC recovers).
    //
    // v31 (H0): wait for the receipt before adding to the Set. writeContract
    // returns a hash the moment the RPC accepts the tx — it does NOT confirm
    // the contract accepted the value. The pre-v31 order (add → writeContract
    // → log success) silently lost the topic if the tx reverted: a contract-
    // level InsufficientContractBalance (e.g. another actor drained the
    // contract's STT balance below the inference deposit in the same block)
    // reverts BEFORE any value is forwarded, so msg.value is refunded to the
    // relayer EOA — but the topic is in the Set, so the next tick skips it
    // and the operator has to hand-edit SUBMITTED_TOPICS_FILE to recover.
    // v31 fixes the same theme as v30 H1: don't trust the relayer's local
    // view of "this topic is done"; verify on-chain. The other 4 relayer
    // paths (tryResetStuckMarket, retryInferenceFromCache, etc.) already
    // follow the wait-for-receipt pattern; drainTopicFeed is the only one
    // that trusted writeContract's return value.
    try {
      const topUp = await readInferenceTopUp();
      if (topUp > maxWei) {
        // v36 (M0): conditional ellipsis matches the success/reverted log
        // format at L1225/L1233 below — short topics don't get a misleading
        // trailing "…" character.
        console.warn(
          `[relayer] topic "${topic.slice(0, 40)}${topic.length > 40 ? '…' : ''}" needs ${formatEther(topUp)} STT inference top-up, exceeds cap; skipping (will retry next tick)`,
        );
        continue;
      }
      const hash = await walletClient.writeContract({
        address: CONTRACT,
        abi: ABI,
        functionName: 'requestMarketGeneration',
        args: [topic],
        value: topUp,
      });
      // v32 (L0): cap the wait at 60s. Without a timeout, a tx that gets
      // dropped from the mempool (gas too low) blocks the relayer's main
      // loop indefinitely — drainFailureEvents, scanStuckMarkets, etc.
      // can't run while we're stuck here. writeContract's default gas
      // bumping usually mines within 1-2s on Shannon, so 60s is
      // generous; a stuck tx after that is a real problem and the next
      // tick can deal with it.
      let receipt;
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
      } catch (err) {
        console.warn(
          `[relayer] waitForTransactionReceipt timed out for "${topic.slice(0, 40)}${topic.length > 40 ? '…' : ''}" ` +
          `(tx ${hash}); will retry next tick`,
          err.shortMessage ?? err.message,
        );
        continue;  // topic is NOT in the Set — retried next tick
      }
      if (receipt.status !== 'success') {
        console.warn(
          `[relayer] requestMarketGeneration("${topic.slice(0, 40)}${topic.length > 40 ? '…' : ''}") ` +
          `reverted in block ${receipt.blockNumber} (tx ${hash}); will retry next tick`,
        );
        continue;  // topic is NOT in the Set — retried next tick
      }
      // Pre-flight AND on-chain submit both succeeded — claim the topic.
      // The within-process Set is the dedup for any later code path in this
      // tick (none today, but future-proof); the disk-persisted Set
      // (reloaded on relayer startup) is the cross-process dedup. A parallel
      // watchdog relayer can still submit a duplicate in the small race
      // between add and tx-mine — the contract has no on-chain
      // topic→requestId dedup, so the inference-deposit cost is the only
      // defense-in-depth.
      //
      // v32 (H1): write synchronously to disk, not via the 5s-debounced
      // scheduleSubmittedTopicsSave. The debounce is fine for the parse-
      // failure cache (a SIGKILL there just costs a few extra re-parses)
      // but a SIGKILL here costs a duplicate requestMarketGeneration
      // (~0.3 STT inference deposit) on next boot. The sync write is
      // ~5ms of disk time per topic submission, well below the 30s
      // POLL_MS, and bounded by TOPIC_FEED_MAX_PER_TICK (default 1).
      // saveSubmittedTopics uses writeFileSync + renameSync so the
      // write itself is atomic — the on-disk file is always either the
      // pre-add state or the post-add state, never a partial write.
      submittedTopics.add(topic);
      saveSubmittedTopics();
      console.log(
        `[relayer] submitted requestMarketGeneration("${topic.slice(0, 40)}${topic.length > 40 ? '…' : ''}") ` +
        `→ ${hash} (value=${formatEther(topUp)} STT, block ${receipt.blockNumber})`,
      );
    } catch (err) {
      // v48 (M2): include value=${formatEther(topUp)} STT so the operator
      // can tell "top-up needed exceeds relayer's cap" (topUp > maxWei is
      // the line above; this catch fires on a writeContract RPC error,
      // which can also surface if the platform is rate-limiting or the
      // relayer EOA is out of gas) from "RPC rejecting writes" without
      // cross-referencing getGenerationFundingStatus manually. Same
      // conditional-ellipsis pattern as the sibling success/reverted/cap
      // logs at L1245/L1268/L1276/L1303.
      console.error(
        `[relayer] requestMarketGeneration("${topic.slice(0, 40)}${topic.length > 40 ? '…' : ''}") ` +
        `failed (value=${formatEther(topUp)} STT):`,
        err.shortMessage ?? err.message,
      );
      // Pre-flight RPC blip (readInferenceTopUp): topic NOT in Set — retried
      // next tick. writeContract RPC error (relayer couldn't even submit):
      // topic NOT in Set — retried next tick. waitForTransactionReceipt
      // timeout: topic NOT in Set (handled by the explicit catch + continue
      // above) — retried next tick. Sync disk write failure
      // (saveSubmittedTopics catches internally and warns): topic IS in
      // the in-memory Set but the disk write may not have landed — the
      // next boot would re-submit. This is the residual risk: a disk
      // failure between the Set-add and the atomic rename. The
      // saveSubmittedTopics try/catch at L385-387 already logs the
      // warning; the operator can hand-edit SUBMITTED_TOPICS_FILE.
    }
  }
}

let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
  // v16 (H3): flush the parse-failure cache synchronously on shutdown so
  // the next relayer boot can pick up where this one left off.
  flushParseFailureCacheSync();
  // v29 (H1): same guarantee for the submitted-topics cache.
  flushSubmittedTopicsSync();
  // v62 (M0): same guarantee for the auto-liquidity seeded-markets
  // cache. A SIGKILL here would re-seed markets on restart, costing
  // ~0.02 STT per market — bounded by LIQUIDITY_SEED_MAX_PER_TICK
  // so the relayer can't blow its own STT on a bad restart.
  saveSeededMarkets();
  saveClaimedMarkets();
  saveStrandedSeeds(); // v64 (M0): persist for the dApp's /stranded-seeds endpoint
});
process.on('SIGTERM', () => {
  stopping = true;
  flushParseFailureCacheSync();
  flushSubmittedTopicsSync();
  saveSeededMarkets();
  saveClaimedMarkets();
  saveStrandedSeeds();
});

while (!stopping) {
  // One set per tick so a market that appears in both the event stream and
  // the scan isn't re-submitted (the second call would revert with MarketNotOpen).
  const alreadySubmitted = new Set();
  try {
    await scanStuckMarkets(alreadySubmitted);
    await scanStuckGenerationRequests(alreadySubmitted);
    // v29 (H1): drainTopicFeed submits new requestMarketGeneration calls for
    // any topics in the feed that haven't been submitted by this EOA. The
    // persistent submittedTopics Set (state/submitted-topics.<eoa>.json) is
    // the cross-restart dedup, so a relayer that comes up after editing
    // scripts/topics.txt picks up only the new entries.
    await drainTopicFeed();
    // v62 (M0): drainSeedEvents runs AFTER drainTopicFeed (a market
    // auto-created by the topic feed in this tick is seeded in the
    // same tick) and BEFORE drainInferenceUnderfundedEvents (no
    // ordering dependency, but keeps the "creation" surfaces grouped
    // with the "resolution" surfaces in the log). The function is
    // a fast-path no-op when RELAYER_LIQUIDITY_STT='0'.
    // v65 (H0): backfillSeededMarkets runs BEFORE drainSeedEvents.
    // It scans all historical markets for missing seeds (markets
    // created before the v62 cursor was set). Idempotent
    // (gated by hasBackfilled flag, in-memory only) and a no-op
    // after the first tick. Logs the count of backfilled markets
    // so the operator can see what was missed.
    await backfillSeededMarkets(alreadySubmitted);
    // v68 (M0): auto-fund the contract if the balance is below
    // the configured threshold. Runs every tick; cheap no-op when
    // disabled (RELAYER_AUTO_FUND_STT='0') or when the contract
    // is already funded. The per-refill cap (min(0.1 * EOA
    // balance, RELAYER_AUTO_FUND_MAX_PER_REFILL_STT)) bounds the
    // spend so a single tick can't blow the relayer EOA's
    // balance.
    await maybeAutoFundContract();
    // v66 (M0) + v67 (L2): partial-seed retry. v67 changed the
    // schedule — retryPartialSeeds is now called EVERY tick (not
    // just every 30 min). The function itself has two paths:
    //   1. flaggedPartials (a Map<marketId, {attempts}>) is
    //      retried on every tick. Markets stay in the set until
    //      both sides land, or until 60 attempts (30 min at 30s
    //      POLL_MS) elapses, at which point they're dropped with
    //      an advisory log.
    //   2. The full seededMarkets Set is scanned every
    //      RETRY_PARTIAL_SEED_INTERVAL_TICKS (default 60 = ~30
    //      min) for the slow-path case where the partial wasn't
    //      detected on the original attempt.
    // Cheap no-op when neither set is non-empty.
    tickCount++;
    await retryPartialSeeds(alreadySubmitted);
    await drainSeedEvents(alreadySubmitted);
    // v28 (H1): drainInferenceUnderfundedEvents runs BEFORE drainFailureEvents.
    // The InferenceUnderfunded path emits BOTH InferenceUnderfunded AND
    // ResolutionFailed(stage=Inference); the v16 ordering let drainFailureEvents
    // call requestResolution (the wasteful re-parse) first, which cleared the
    // cache (v17 invariant) and blocked drainInferenceUnderfundedEvents' cache
    // retry via the hasCachedParse pre-check. Swapping gives the cache-aware
    // retryInferenceFromCache path the first shot — if it succeeds (contract
    // funded), the market is in Resolving. If it reverts (contract still
    // underfunded), the per-tick alreadySubmitted Set prevents the wasteful
    // re-parse from running. drainFailureEvents still runs as the fallback for
    // parse-stage failures, where retryInferenceFromCache isn't applicable.
    await drainInferenceUnderfundedEvents(alreadySubmitted);
    await drainFailureEvents(alreadySubmitted);
    await drainGenerationFailureEvents();
    await scanForRetryableMarkets(alreadySubmitted);
    // v63 (H1): scan stranded seeds for LRU eviction. The function
    // is a fast no-op when strandedSeedMarkets is empty, so the cost
    // is one Date.now() call per tick in steady state. When non-empty,
    // it logs advisory lines for any URLs that have been evicted
    // (TTL or FIFO) so the operator can see the seed money is no
    // longer locked. Re-attempting resolution is passive — the next
    // scanForRetryableMarkets pass (called above) will see the URL
    // is no longer in the cache and call tryResolveMarket.
    await drainStrandedSeeds();
    await logResolvedMarkets();
  } catch (err) {
    console.error('[relayer] loop error:', err.shortMessage ?? err.message);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
console.log('[relayer] stopped');
