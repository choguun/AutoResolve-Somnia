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
        <div className="shrink-0 transition-transform duration-300 hover:scale-[1.02]">
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </div>
    </header>
  );
}
