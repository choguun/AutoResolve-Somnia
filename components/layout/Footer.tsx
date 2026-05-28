import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/5 bg-white/[0.02] backdrop-blur-md py-8 text-sm text-zinc-500 shadow-[0_-10px_30px_rgba(0,0,0,0.2)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="font-medium tracking-wide">Autonomous prediction markets on Somnia.</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <a
            href="https://somnia.network"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-400/80 font-semibold transition-all duration-300 hover:text-cyan-200 hover:drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]"
          >
            Somnia Agentic L1
          </a>
          <Link
            href="https://agents.testnet.somnia.network"
            className="text-violet-400/80 font-semibold transition-all duration-300 hover:text-violet-200 hover:drop-shadow-[0_0_8px_rgba(139,92,246,0.5)]"
          >
            Agent Receipts
          </Link>
        </div>
      </div>
    </footer>
  );
}
