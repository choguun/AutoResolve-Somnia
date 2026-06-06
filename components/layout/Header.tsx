'use client';

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { usePathname } from 'next/navigation';
import { useRpcHealth, type RpcHealth } from '@/hooks/useRpcHealth';
import { Tooltip } from '@/components/shared/Tooltip';

function healthColor(health: RpcHealth): string {
  switch (health) {
    case 'ok':
      return 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]';
    case 'slow':
      return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]';
    case 'stuck':
      // v34 (L1): chain halted for 2+ ticks. Same red as 'down' but
      // visually distinguishable via the ping-animation (stuck still
      // pings, down doesn't) so operators can tell "RPC up, chain
      // halted" from "RPC unreachable".
      return 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]';
    case 'down':
      return 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]';
    default:
      return 'bg-zinc-500';
  }
}

function healthLabel(health: RpcHealth, latencyMs: number | null, block: bigint | null): string {
  if (health === 'pending') return 'Checking Somnia RPC...';
  if (health === 'down') return 'Somnia RPC unreachable';
  // v34 (L1): distinct copy for the stuck state. Same color as 'down'
  // (rose) but a different message so the operator knows the recovery
  // path is different — RPC is responding, but the chain itself
  // stopped producing blocks.
  if (health === 'stuck') {
    const parts: string[] = ['Somnia chain stuck'];
    if (block !== null) parts.push(`last block #${block.toString()}`);
    return parts.join(' · ');
  }
  const parts: string[] = [];
  parts.push(health === 'ok' ? 'Somnia RPC live' : 'Somnia RPC slow');
  if (latencyMs !== null) parts.push(`${Math.round(latencyMs)}ms`);
  if (block !== null) parts.push(`block #${block.toString()}`);
  return parts.join(' · ');
}

function RpcStatusIndicator() {
  const { health, blockNumber, latencyMs } = useRpcHealth();

  return (
    <Tooltip content={healthLabel(health, latencyMs, blockNumber)}>
      <span className="inline-flex items-center gap-2 rounded-md border border-white/5 bg-black/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        <span className="relative inline-flex h-2 w-2">
          {health !== 'down' && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                health === 'ok'
                  ? 'bg-emerald-400'
                  : health === 'slow'
                    ? 'bg-amber-400'
                    // v34 (L1): stuck pings in red (same as down's
                    // static color) so the operator can tell at a
                    // glance that the indicator is "live" (pinging)
                    // but the chain is "stuck" (red).
                    : health === 'stuck'
                      ? 'bg-rose-400'
                      : 'bg-zinc-400'
              }`}
            />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${healthColor(health)}`} />
        </span>
        <span className="hidden sm:inline">Shannon</span>
      </span>
    </Tooltip>
  );
}

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#050508]/60 backdrop-blur-xl shadow-lg shadow-black/20">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="group flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all duration-300 group-hover:border-white/20 group-hover:shadow-[0_0_25px_rgba(139,92,246,0.3)]">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-violet-600/20 opacity-50 transition-opacity duration-300 group-hover:opacity-100" />
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="relative z-10 h-6 w-6 transition-transform duration-500 group-hover:scale-110"
              >
                <path
                  d="M12 3L3 8V16L12 21L21 16V8L12 3Z"
                  stroke="url(#logo-gradient)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 3V21M3 8L21 16M3 16L21 8"
                  stroke="url(#logo-gradient)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="opacity-40"
                />
                <circle cx="12" cy="12" r="3" fill="currentColor" className="text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                <defs>
                  <linearGradient id="logo-gradient" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#22d3ee" />
                    <stop offset="1" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="truncate text-xl font-extrabold tracking-tight text-white transition-colors duration-300 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-cyan-200">
              AutoResolve
            </span>
          </Link>
          <nav className="hidden gap-2 rounded-xl border border-white/5 bg-white/5 p-1.5 backdrop-blur-md shadow-inner md:flex">
            <Link
              href="/"
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all duration-300 ${pathname === '/' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
            >
              Markets
            </Link>
            <Link
              href="/create"
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all duration-300 ${pathname === '/create' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
            >
              Create
            </Link>
            <Link
              href="/proof"
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all duration-300 ${pathname === '/proof' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
            >
              Proof
            </Link>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <RpcStatusIndicator />
          <div className="transition-transform duration-300 hover:scale-[1.02]">
            <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
          </div>
        </div>
      </div>
    </header>
  );
}
