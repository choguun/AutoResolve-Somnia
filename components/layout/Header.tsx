'use client';

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#090b10]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-sm font-black text-cyan-200 shadow-[0_0_24px_rgba(6,182,212,0.16)]">
              AR
            </span>
            <span className="truncate text-lg font-bold tracking-tight text-white sm:text-xl">
              AutoResolve
            </span>
          </Link>
          <nav className="hidden gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1 text-sm text-zinc-400 md:flex">
            <Link href="/" className="rounded-md px-3 py-1.5 transition-colors hover:bg-white/5 hover:text-white">
              Markets
            </Link>
            <Link href="/create" className="rounded-md px-3 py-1.5 transition-colors hover:bg-white/5 hover:text-white">
              Create
            </Link>
            <Link href="/proof" className="rounded-md px-3 py-1.5 transition-colors hover:bg-white/5 hover:text-white">
              Proof
            </Link>
          </nav>
        </div>
        <div className="shrink-0">
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </div>
    </header>
  );
}
