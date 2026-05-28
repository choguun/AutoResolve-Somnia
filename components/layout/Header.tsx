'use client';

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { usePathname } from 'next/navigation';

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#050508]/60 backdrop-blur-xl shadow-lg shadow-black/20">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="group flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400/10 to-violet-500/10 text-sm font-black text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] group-hover:border-cyan-400/50">
              AR
            </span>
            <span className="truncate text-lg font-bold tracking-tight text-white transition-colors duration-300 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-cyan-200 sm:text-xl">
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
        <div className="shrink-0 transition-transform duration-300 hover:scale-[1.02]">
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </div>
    </header>
  );
}
