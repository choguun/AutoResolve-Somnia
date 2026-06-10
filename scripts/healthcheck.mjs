// v56 (L0) relayer-fix: tiny HTTP healthcheck shim. Railway's service-level
// healthcheck is set to GET /health on port 3000; this shim listens on
// 0.0.0.0:3000 and returns 200 OK when the relayer process is alive, 503
// otherwise. The relayer itself is started as a child process by this shim.
//
// Why an HTTP shim instead of the Dockerfile's pgrep HEALTHCHECK?
// Because the service-level `health_check_path` setting on Railway
// overrides the Dockerfile's HEALTHCHECK directive with an HTTP probe;
// pgrep doesn't respond to HTTP, so the probe times out after 5s and
// the container is marked unhealthy after 11 attempts (~5min).

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PORT = Number(process.env.HEALTHCHECK_PORT ?? 3000);
const RELAYER_PATH = '/app/scripts/relayer.mjs';
const PIDFILE = '/app/state/.relayer.pid';
// v64 (M0): state-file paths for the /stranded-seeds endpoint. Both
// files are EOA-namespaced by the relayer (mirroring
// state/seeded-markets.<eoa>.json + state/parse-failure-cache.<eoa>.json).
// The shim cross-references them on each request to derive the
// stranded-seeds set (no new state file needed). The <eoa> filename
// suffix is unknown at shim-startup (the shim doesn't load the
// relayer's account), so we glob the state dir and pick the first
// matching file. This is a single-relayer shim — two relayers on
// the same host would need a different design (e.g. expose the EOA
// via a /stranded-seeds-eoa endpoint). For the single-Railway-
// service case, the glob is fine.
const STATE_DIR = '/app/state';

if (!existsSync(RELAYER_PATH)) {
  console.error(`[healthcheck] relayer not found at ${RELAYER_PATH}`);
  process.exit(1);
}

const child = spawn('node', [RELAYER_PATH], {
  stdio: 'inherit',
  detached: false,
});

if (child.pid != null) {
  try {
    writeFileSync(PIDFILE, String(child.pid));
  } catch {
    // pidfile is a hint, not load-bearing
  }
  console.log(`[healthcheck] relayer started, pid=${child.pid}`);
}

child.on('exit', (code, signal) => {
  console.error(`[healthcheck] relayer exited code=${code} signal=${signal}`);
  try {
    server.close();
  } catch {
    // already closed
  }
});

function isAlive() {
  if (child.exitCode != null) return false;
  if (child.pid == null) return false;
  try {
    process.kill(child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Reply to GET /health with 200 if relayer is alive, 503 otherwise.
// Accept both GET and HEAD — Railway's HTTP probe uses GET by
// default but the service-level health_check_path setting can be
// configured to use HEAD; we don't know which one. We always set
// Content-Length explicitly so the HTTP response parser doesn't
// block waiting for connection close to determine body length.
// v64 (M0): /stranded-seeds endpoint. Reads the relayer's
// stranded-seeds.<eoa>.json (the relayer writes this on every set
// mutation) and cross-references with parse-failure-cache.<eoa>.json
// to determine which entries are still stranded (URL still in
// cache). Returns the count + total STT locked + per-market detail.
// CORS is open (the dApp polls this from the browser; the relayer
// is internal-only on Railway's network so cross-origin is fine).
function handleStrandedSeeds(req, res) {
  // Glob the state dir for the seeded-markets file (one per EOA).
  // The current Railway deployment runs a single relayer, so the
  // first match is the one. A future multi-relayer host would
  // need an env var to pin the EOA, but for v64 the glob is fine.
  let seededFile = null;
  let eoa = null;
  try {
    const files = readdirSync(STATE_DIR);
    const matches = files.filter(
      (f) => f.startsWith('seeded-markets.') && f.endsWith('.json'),
    );
    if (matches.length > 0) {
      const fname = matches[0];
      seededFile = `${STATE_DIR}/${fname}`;
      eoa = fname.replace(/^seeded-markets\./, '').replace(/\.json$/, '');
    }
  } catch {
    // STATE_DIR doesn't exist (fresh container, no relayer has run
    // yet) — return empty result.
  }
  if (!seededFile || !eoa) {
    const body = JSON.stringify({ eoa: null, count: 0, totalStrandedStt: '0', markets: [] });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
    return;
  }
  // Load the parse-failure cache to know which seeded markets are
  // still stranded (URL still in LRU).
  const cacheFile = `${STATE_DIR}/parse-failure-cache.${eoa}.json`;
  const cacheMap = (() => {
    if (!existsSync(cacheFile)) return {};
    try {
      const raw = readFileSync(cacheFile, 'utf8');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  })();
  // Load the v64 stranded-seeds file (relayer writes this on every
  // stranded-set mutation). The file is an array of
  // { marketId, url, expiresAt } entries.
  const strandedFile = `${STATE_DIR}/stranded-seeds.${eoa}.json`;
  const strandedArr = (() => {
    if (!existsSync(strandedFile)) return [];
    try {
      const raw = readFileSync(strandedFile, 'utf8');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })();
  const now = Date.now();
  const markets = [];
  for (const entry of strandedArr) {
    const { marketId, url, expiresAt } = entry;
    if (typeof marketId !== 'string' || typeof url !== 'string') continue;
    // The file's expiresAt mirrors the cache's expiresAt at write
    // time. If the entry is now expired in the cache, drop it
    // (the relayer's drainStrandedSeeds will have already removed
    // it from the in-memory Map; the on-disk file just hasn't
    // been re-written yet).
    if (typeof expiresAt === 'number' && expiresAt < now) continue;
    // Compute the urlKey (matches the relayer's urlKey exactly) and
    // verify the URL is still in the cache. If not, the recovery
    // path has fired and the seed is unlocked.
    const k = createHash('keccak256').update(url.toLowerCase().trim()).digest('hex');
    const cachedExpiresAt = cacheMap[k];
    if (cachedExpiresAt === undefined || cachedExpiresAt < now) continue;
    markets.push({
      marketId,
      url,
      expiresAt: cachedExpiresAt,
    });
  }
  // The seed size is 2 * RELAYER_LIQUIDITY_STT. We don't have access
  // to the env from the shim, so we hardcode 0.02 STT per market
  // (the v62 default). If the operator changes the env, the
  // stranded-seeds.json file should also store the per-market seed
  // size — that's a v65 polish.
  const SEED_SIZE_PER_MARKET = 0.02; // 0.01 STT per side * 2
  const totalStrandedStt = (markets.length * SEED_SIZE_PER_MARKET).toFixed(3);
  const body = JSON.stringify({
    eoa,
    count: markets.length,
    totalStrandedStt,
    markets,
  });
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = createServer((req, res) => {
  if ((req.method === 'GET' || req.method === 'HEAD') && (req.url === '/health' || req.url === '/')) {
    if (isAlive()) {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Content-Length': 3,
      });
      res.end('OK\n');
    } else {
      res.writeHead(503, {
        'Content-Type': 'text/plain',
        'Content-Length': 18,
      });
      res.end('relayer not alive\n');
    }
    return;
  }
  if (req.method === 'OPTIONS' && req.url === '/stranded-seeds') {
    // CORS preflight.
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Length': 0,
    });
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url === '/stranded-seeds') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    handleStrandedSeeds(req, res);
    return;
  }
  res.writeHead(404, {
    'Content-Type': 'text/plain',
    'Content-Length': 10,
  });
  res.end('not found\n');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[healthcheck] listening on 0.0.0.0:${PORT}`);
});

const shutdown = (signal) => {
  console.log(`[healthcheck] received ${signal}, killing relayer`);
  try {
    if (child.pid != null) process.kill(child.pid, 'SIGTERM');
  } catch {
    // already dead
  }
  setTimeout(() => process.exit(0), 1000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
