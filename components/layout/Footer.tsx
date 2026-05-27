import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/10 py-8 text-center text-sm text-zinc-500">
      <p>
        Built on{' '}
        <a
          href="https://somnia.network"
          target="_blank"
          rel="noreferrer"
          className="text-cyan-400 hover:underline"
        >
          Somnia Agentic L1
        </a>
        {' · '}
        <Link href="https://agents.testnet.somnia.network" className="text-violet-400 hover:underline">
          Agent Receipts
        </Link>
      </p>
    </footer>
  );
}
