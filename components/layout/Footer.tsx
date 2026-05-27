import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-black/10 py-8 text-sm text-zinc-500">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Autonomous prediction markets on Somnia.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <a
            href="https://somnia.network"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-300 transition-colors hover:text-cyan-200"
          >
            Somnia Agentic L1
          </a>
          <Link
            href="https://agents.testnet.somnia.network"
            className="text-violet-300 transition-colors hover:text-violet-200"
          >
            Agent Receipts
          </Link>
        </div>
      </div>
    </footer>
  );
}
