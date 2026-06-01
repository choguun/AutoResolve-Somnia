import Link from 'next/link';
import { ExternalLink, Receipt, ShieldCheck } from 'lucide-react';
import { CONTRACT_ADDRESS } from '@/lib-web/contract';
import { addressExplorerUrl } from '@/lib-web/agents';
import { CopyButton } from '@/components/shared/CopyButton';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/5 bg-white/[0.02] backdrop-blur-md py-8 text-sm text-zinc-500 shadow-[0_-10px_30px_rgba(0,0,0,0.2)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium tracking-wide text-zinc-300">Autonomous prediction markets on Somnia.</p>
            <p className="mt-1 text-xs text-zinc-500">
              Built for the Somnia Agentathon — judges can verify every claim in the README.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <a
              href="https://somnia.network"
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-1.5 text-cyan-400/80 font-semibold transition-all duration-300 hover:text-cyan-200 hover:drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]"
            >
              Somnia Agentic L1
              <ExternalLink className="h-4 w-4 opacity-70 transition-transform group-hover:scale-110 group-hover:opacity-100" />
            </a>
            <Link
              href="https://agents.testnet.somnia.network"
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-1.5 text-violet-400/80 font-semibold transition-all duration-300 hover:text-violet-200 hover:drop-shadow-[0_0_8px_rgba(139,92,246,0.5)]"
            >
              <Receipt className="h-4 w-4 opacity-70 transition-transform group-hover:scale-110 group-hover:opacity-100" />
              Agent Receipts
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/5 pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/80" />
            <span className="text-zinc-500">Deployed on Shannon Testnet</span>
            <span className="text-zinc-700">·</span>
            <a
              href={addressExplorerUrl(CONTRACT_ADDRESS)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-cyan-400/80 transition hover:text-cyan-200"
            >
              {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}
            </a>
            <CopyButton value={CONTRACT_ADDRESS} label="Copy contract address" />
          </div>
          <span className="text-zinc-600">Chain ID 50312 · STT</span>
        </div>
      </div>
    </footer>
  );
}
