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
import { existsSync, writeFileSync } from 'node:fs';

const PORT = Number(process.env.HEALTHCHECK_PORT ?? 3000);
const RELAYER_PATH = '/app/scripts/relayer.mjs';
const PIDFILE = '/app/state/.relayer.pid';

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
