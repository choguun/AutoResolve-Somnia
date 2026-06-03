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
//   SHANNON_RPC_URL     defaults to https://dream-rpc.somnia.network
//   RELAYER_POLL_MS     seconds between scans (default 30)
//   RELAYER_MAX_BET_GAS max STT willing to spend on a single top-up (default 1)
//   RELAYER_VERBOSE     1 to log every market scanned, 0 to log only retries (default 1)
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
const MAX_BET_GAS_STT = process.env.RELAYER_MAX_BET_GAS ?? '1';
const VERBOSE = process.env.RELAYER_VERBOSE !== '0';

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

console.log('[relayer] starting');
console.log(`  rpc:         ${SHANNON_RPC_URL}`);
console.log(`  contract:    ${CONTRACT}`);
console.log(`  relayer eoa: ${account.address}`);
console.log(`  poll:        ${POLL_MS / 1000}s`);
console.log(`  max top-up:  ${MAX_BET_GAS_STT} STT per market`);

let lastScannedBlock = await publicClient.getBlockNumber();
console.log(`  resume from block: ${lastScannedBlock}\n`);

async function tryResolveMarket(marketId) {
  try {
    const status = await publicClient.readContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'getResolutionFundingStatus',
    });
    const topUp = status[2]; // topUpNeeded
    const maxWei = parseEther(MAX_BET_GAS_STT);
    if (topUp > maxWei) {
      console.warn(`[relayer] market ${marketId} needs ${formatEther(topUp)} STT top-up, exceeds cap`);
      return false;
    }

    const hash = await walletClient.writeContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'requestResolution',
      args: [marketId],
      value: topUp,
    });
    console.log(`[relayer]   submitted requestResolution(${marketId}) → ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[relayer]   confirmed in block ${receipt.blockNumber} (status ${receipt.status})`);
    return receipt.status === 'success';
  } catch (err) {
    console.error(`[relayer]   requestResolution(${marketId}) failed:`, err.shortMessage ?? err.message);
    return false;
  }
}

async function scanForRetryableMarkets() {
  const nextId = await publicClient.readContract({
    address: CONTRACT, abi: ABI, functionName: 'nextMarketId',
  });
  if (nextId === 1n) return;
  const totalDeposit = await publicClient.readContract({
    address: CONTRACT, abi: ABI, functionName: 'getRequiredDeposit',
  });

  const marketIds = [];
  for (let id = 1n; id < nextId; id++) {
    const ctx = await publicClient.readContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'getAgentMarketContext',
      args: [id],
    });
    if (ctx.exists && ctx.canResolve) marketIds.push(id);
  }

  if (VERBOSE) {
    console.log(
      `[relayer] scanned ${nextId - 1n} markets, ${marketIds.length} resolvable, ` +
        `required deposit ${formatEther(totalDeposit)} STT`,
    );
  }
  for (const id of marketIds) {
    console.log(`[relayer] retrying market ${id}`);
    await tryResolveMarket(id);
  }
}

async function drainFailureEvents() {
  const head = await publicClient.getBlockNumber();
  if (head < lastScannedBlock) {
    // Chain reorg or RPC reset; resync to a safe margin.
    lastScannedBlock = head - 10n;
    return;
  }
  const fromBlock = lastScannedBlock + 1n;
  const toBlock = head;
  if (fromBlock > toBlock) return;

  const logs = await publicClient.getLogs({
    address: CONTRACT,
    fromBlock,
    toBlock,
  }).catch((err) => {
    console.error('[relayer] getLogs failed:', err.shortMessage ?? err.message);
    return [];
  });

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
    console.log(
      `[relayer] re-resolving market ${marketId} after failure (requestId ${requestId})`,
    );
    await tryResolveMarket(marketId);
  }
  lastScannedBlock = toBlock;
}

async function logResolvedMarkets() {
  // Cheap side-effect: log when a market actually resolves, so the operator can see the loop closed.
  const head = await publicClient.getBlockNumber();
  const from = head > 50n ? head - 50n : 0n;
  const logs = await publicClient.getLogs({
    address: CONTRACT,
    fromBlock: from,
    toBlock: head,
  }).catch(() => []);
  const resolved = logs.filter(
    (l) => l.topics[0]?.toLowerCase() === MARKET_RESOLVED_TOPIC.toLowerCase(),
  );
  for (const log of resolved) {
    const outcome = BigInt(log.topics[2]) === 1n ? 'YES' : 'NO';
    console.log(`[relayer] ✓ market ${log.topics[1]} resolved outcome=${outcome}`);
  }
}

let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

while (!stopping) {
  try {
    await drainFailureEvents();
    await scanForRetryableMarkets();
    await logResolvedMarkets();
  } catch (err) {
    console.error('[relayer] loop error:', err.shortMessage ?? err.message);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
console.log('[relayer] stopped');
