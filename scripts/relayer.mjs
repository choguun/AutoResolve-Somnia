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
// Requires `pnpm install` to have produced lib-web/abi.json (via `pnpm export-abi`).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
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

console.log('[relayer] starting (v14)');
console.log(`  rpc:         ${SHANNON_RPC_URL}`);
console.log(`  contract:    ${CONTRACT}`);
console.log(`  relayer eoa: ${account.address}`);
console.log(`  poll:        ${POLL_MS / 1000}s`);
console.log(`  max top-up:  ${MAX_TOPUP_STT} STT per market`);
console.log(`  max attempts: ${MAX_ATTEMPTS_PER_MARKET} per market before giving up`);

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
const maxWei = parseEther(MAX_TOPUP_STT);

function marketKey(marketId) {
  // Normalize so a market that appears in both the event stream (hex) and the
  // scan (bigint) hits the same Set entry. Topics are 32-byte ABI-encoded
  // uint256, so BigInt() decodes both shapes the same way.
  return BigInt(marketId).toString();
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

async function tryResolveMarket(marketId, alreadySubmitted) {
  const key = marketKey(marketId);
  if (alreadySubmitted.has(key)) {
    if (VERBOSE) console.log(`[relayer]   skipping market ${marketId} (already queued this tick)`);
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
    console.log(
      `[relayer]   submitted requestResolution(${marketId}) → ${hash} ` +
        `(attempt ${attempts + 1}/${MAX_ATTEMPTS_PER_MARKET})`,
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[relayer]   confirmed in block ${receipt.blockNumber} (status ${receipt.status})`);
    if (receipt.status === 'success') {
      // The market either moved to Resolving (in-flight resolution) or rolled
      // back to Open on inner failure. Either way the previous attempt budget
      // is no longer meaningful — clear it so a future stuck-then-reset market
      // gets a fresh budget.
      attemptCount.delete(key);
    }
    return receipt.status === 'success';
  } catch (err) {
    attemptCount.set(key, attempts + 1);
    console.error(
      `[relayer]   requestResolution(${marketId}) failed:`,
      err.shortMessage ?? err.message,
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
    console.log(
      `[relayer] re-resolving market ${marketId} after failure (requestId ${requestId})`,
    );
    await tryResolveMarket(marketId, alreadySubmitted);
  }
  lastScannedBlock = toBlock;
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
      // reset budget since the recovery worked.
      attemptCount.delete(key);
      resetAttemptCount.delete(resetKey);
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

async function drainGenerationFailureEvents(alreadySubmitted) {
  // GenerationFailed is *not* auto-retried: a "wrong-selector" or
  // "no-tool-calls" failure means the proposer's topic was unsolvable by the
  // agent, which is the proposer's call to fix (and re-submit with a
  // different topic if they want). The relayer only logs so the operator can
  // see the failure rate.
  //
  // Use a small backward window (like logResolvedMarkets) rather than the
  // shared lastScannedBlock cursor — generation failures are advisory, not
  // act-on-able, so we don't need a forward-only scan with cursor advance.
  // Dedupe with a Set so we don't spam the same warning every 30s.
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
    if (alreadySubmitted.has(marketKey(log.topics[1]))) continue;
    // topics[1] is the requestId; the reason is non-indexed so we can't decode
    // it without a full ABI log decode, but the operator can correlate by id.
    console.warn(
      `[relayer] generation request ${log.topics[1]} failed (no auto-retry; see receipt at https://agents.testnet.somnia.network/receipts/${log.topics[1]})`,
    );
    alreadySubmitted.add(marketKey(log.topics[1]));
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

let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

while (!stopping) {
  // One set per tick so a market that appears in both the event stream and
  // the scan isn't re-submitted (the second call would revert with MarketNotOpen).
  const alreadySubmitted = new Set();
  try {
    await scanStuckMarkets(alreadySubmitted);
    await scanStuckGenerationRequests(alreadySubmitted);
    await drainFailureEvents(alreadySubmitted);
    await drainGenerationFailureEvents(alreadySubmitted);
    await scanForRetryableMarkets(alreadySubmitted);
    await logResolvedMarkets();
  } catch (err) {
    console.error('[relayer] loop error:', err.shortMessage ?? err.message);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
console.log('[relayer] stopped');
