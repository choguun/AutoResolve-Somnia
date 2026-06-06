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
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
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

console.log('[relayer] starting (v30)');
console.log(`  rpc:         ${SHANNON_RPC_URL}`);
console.log(`  contract:    ${CONTRACT}`);
console.log(`  relayer eoa: ${account.address}`);
console.log(`  poll:        ${POLL_MS / 1000}s`);
console.log(`  max top-up:  ${MAX_TOPUP_STT} STT per market`);
console.log(`  max attempts: ${MAX_ATTEMPTS_PER_MARKET} per market before giving up`);
console.log(`  topic feed:  ${TOPICS_FILE} (max ${TOPIC_FEED_MAX_PER_TICK}/tick)`);

let lastScannedBlock = await publicClient.getBlockNumber();
console.log(`  resume from block: ${lastScannedBlock}\n`);

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
const maxWei = parseEther(MAX_TOPUP_STT);

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
  // Normalize the URL for the LRU key: trim + lowercase the scheme + host so
  // "https://Example.com/path" and "https://example.com/path" share an entry.
  // The path is case-sensitive in the LLM parsing sense, so we leave the path
  // alone. Cheap hash (djb2) — no crypto needed, just to spread LRU entries.
  const normalized = url.trim().toLowerCase().split('/').slice(0, 3).join('/');
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

function scheduleSubmittedTopicsSave() {
  submittedTopicsWriteDirty = true;
  if (submittedTopicsWriteTimer) return;
  submittedTopicsWriteTimer = setTimeout(() => {
    submittedTopicsWriteTimer = null;
    if (!submittedTopicsWriteDirty) return;
    submittedTopicsWriteDirty = false;
    saveSubmittedTopics();
  }, 5000);
}

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

loadParseFailureCache();
loadSubmittedTopics();
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
async function readInferenceTopUp() {
  const deposit = await publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'getInferenceDeposit',
  });
  // Compute topUpNeeded vs contract balance locally — the contract's
  // getGenerationFundingStatus returns the same arithmetic, but the inference
  // path doesn't have a direct "getInferenceFundingStatus" view, so we mirror
  // the math here.
  const balance = await publicClient.getBalance({ address: CONTRACT });
  return balance >= deposit ? 0n : deposit - balance;
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
    console.log(
      `[relayer] re-resolving market ${marketId} after failure (requestId ${requestId}, stage=${stage})`,
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
    const outcome = BigInt(log.topics[2]) === 1n ? 'YES' : 'NO';
    console.log(`[relayer] ✓ market ${log.topics[1]} resolved outcome=${outcome}`);
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
  // tight — no wasted iterations over the entire uint256 space.
  const allIds = [];
  let cursor = 1n;
  const limit = 50n;
  while (true) {
    const [ids, nextCursor] = await publicClient.readContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'scanStuckGenerationRequests',
      args: [cursor, limit],
    });
    allIds.push(...ids);
    if (nextCursor <= cursor) break;
    cursor = nextCursor;
  }

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
  const fresh = topics.filter((t) => !submittedTopics.has(t));
  if (fresh.length === 0) return;
  console.log(
    `[relayer] topic feed: ${topics.length} total, ${fresh.length} new, ` +
      `submitting up to ${TOPIC_FEED_MAX_PER_TICK}`,
  );
  const slice = fresh.slice(0, TOPIC_FEED_MAX_PER_TICK);
  for (const topic of slice) {
    // v30 (H1): pre-flight checks FIRST, then add to the Set, then submit.
    // The previous order (set add → read topUp → cap check → continue) meant
    // a transient cap-exceedance or a transient RPC blip on readInferenceTopUp
    // would permanently add the topic to submittedTopics — the next relayer
    // tick wouldn't retry, the operator would have to hand-edit
    // SUBMITTED_TOPICS_FILE. Now pre-flight failures keep the topic out of
    // the Set entirely (it'll be retried on the next tick once the operator
    // raises the cap or the RPC recovers). Once pre-flight passes, the add
    // is the "we're committing to this submission" signal — even if the
    // writeContract then reverts InsufficientContractBalance, the deposit
    // was forwarded to the platform and the topic stays in the Set.
    try {
      const topUp = await readInferenceTopUp();
      if (topUp > maxWei) {
        console.warn(
          `[relayer] topic "${topic.slice(0, 40)}…" needs ${formatEther(topUp)} STT inference top-up, exceeds cap; skipping (will retry next tick)`,
        );
        continue;
      }
      // Pre-flight passed — claim the topic. The within-process Set is the
      // dedup for any later code path in this tick (none today, but future-
      // proof); the disk-persisted Set (reloaded on relayer startup) is the
      // cross-process dedup. A parallel watchdog relayer can still submit a
      // duplicate in the small race between add and tx-mine — the contract
      // has no on-chain topic→requestId dedup, so the inference-deposit cost
      // is the only defense-in-depth.
      submittedTopics.add(topic);
      scheduleSubmittedTopicsSave();
      const hash = await walletClient.writeContract({
        address: CONTRACT,
        abi: ABI,
        functionName: 'requestMarketGeneration',
        args: [topic],
        value: topUp,
      });
      console.log(
        `[relayer] submitted requestMarketGeneration("${topic.slice(0, 40)}${topic.length > 40 ? '…' : ''}") → ${hash} (value=${formatEther(topUp)} STT)`,
      );
    } catch (err) {
      console.error(
        `[relayer] requestMarketGeneration("${topic.slice(0, 40)}…") failed:`,
        err.shortMessage ?? err.message,
      );
      // If pre-flight failed (readInferenceTopUp RPC blip), the topic is NOT
      // in the Set — it'll be retried next tick. If the writeContract failed
      // after the Set-add, the topic IS in the Set (deposit was forwarded) —
      // the operator can clear SUBMITTED_TOPICS_FILE if they want to retry.
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
});
process.on('SIGTERM', () => {
  stopping = true;
  flushParseFailureCacheSync();
  flushSubmittedTopicsSync();
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
    await logResolvedMarkets();
  } catch (err) {
    console.error('[relayer] loop error:', err.shortMessage ?? err.message);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
console.log('[relayer] stopped');
