'use client';

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function Header() {
  return (
    <header className="border-b border-white/10 bg-black/30 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              AutoResolve
            </span>
          </Link>
          <nav className="hidden gap-6 text-sm text-zinc-400 md:flex">
            <Link href="/" className="hover:text-white transition-colors">
              Markets
            </Link>
            <Link href="/create" className="hover:text-white transition-colors">
              Create
            </Link>
          </nav>
        </div>
        <ConnectButton showBalance={true} chainStatus="icon" accountStatus="address" />
      </div>
    </header>
  );
}
