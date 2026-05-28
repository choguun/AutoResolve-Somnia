import Link from 'next/link';
import { CONTRACT_ADDRESS } from '@/lib-web/contract';
import {
  addressExplorerUrl,
  receiptExplorerUrl,
  txExplorerUrl,
} from '@/lib-web/agents';

const proofRun = {
  contractAddress: '0x1631303A748076648a0AbbE077a657Ad7812834F',
  marketId: '1',
  question: 'Is the capital of France Paris?',
  source: 'https://en.wikipedia.org/wiki/Paris',
  outcome: 'YES',
  parseRequestId: '2400421',
  inferenceRequestId: '2400485',
  resolutionTx: '0x349fb03fa6262befb581347a979fb5fa2706d48df5d818daec749f624fe54035',
  claimTx: '0x8883273b0bb83dbb7f2cb489b7a5b54b9a7591afeaee58bd472e7fb5b57c2380',
};

const criteria = [
  {
    label: 'Functionality',
    detail: 'Deployed market flow covers create, bet, autonomous resolve, receipt review, and claim.',
  },
  {
    label: 'Agent-First Design',
    detail: 'The contract exposes discovery, context, funding, and invocation methods for resolver agents.',
  },
  {
    label: 'Innovation',
    detail: 'The resolver is a reusable settlement primitive, not a backend oracle or admin action.',
  },
  {
    label: 'Autonomous Performance',
    detail: 'Expired markets can be scanned and resolved independently through Somnia agent callbacks.',
  },
];

export default function ProofPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/15 sm:p-7">
        <div className="mb-3 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
          Resolution Proof Pack
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Agent-Native Settlement, Proved End to End
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base">
          AutoResolve is designed so an autonomous resolver can discover expired markets,
          inspect funding requirements, invoke Somnia agents, and let validator callbacks
          settle the result on-chain.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {criteria.map((item) => (
          <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <h2 className="font-semibold text-white">{item.label}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{item.detail}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.045] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Latest Agent-Discoverable Deployment</h2>
            <p className="mt-1 text-sm text-zinc-500">
              The current frontend points at the v3 contract with autonomous discovery methods.
            </p>
          </div>
          <span className="w-fit rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
            Shannon Testnet
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <ProofLink label="Current Contract" href={addressExplorerUrl(CONTRACT_ADDRESS)} value={CONTRACT_ADDRESS} />
          <ProofLink label="Agent Manifest" href="/api/agent-manifest" value="/api/agent-manifest" external={false} />
          <ProofLink
            label="Well-Known JSON"
            href="/.well-known/autoresolve-agent.json"
            value="/.well-known/autoresolve-agent.json"
            external={false}
          />
          <ProofLink label="Seeded Markets" href={addressExplorerUrl(CONTRACT_ADDRESS)} value="Markets #1 and #2" />
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.045] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Completed Historical Proof Run</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Previous deployment market #{proofRun.marketId} resolved through Parse Website and LLM Inference receipts.
            </p>
          </div>
          <span className="w-fit rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
            Outcome {proofRun.outcome}
          </span>
        </div>

        <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-zinc-500">Question</div>
            <div className="mt-1 font-medium text-white">{proofRun.question}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-zinc-500">Source</div>
            <a
              href={proofRun.source}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block break-all text-cyan-200 transition hover:text-cyan-100"
            >
              {proofRun.source}
            </a>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <ProofLink label="Proof Contract" href={addressExplorerUrl(proofRun.contractAddress)} value="v2 Shannon Explorer" />
          <ProofLink
            label="Parse Validator Receipt"
            href={receiptExplorerUrl(proofRun.parseRequestId)}
            value={`#${proofRun.parseRequestId}`}
          />
          <ProofLink
            label="Inference Validator Receipt"
            href={receiptExplorerUrl(proofRun.inferenceRequestId)}
            value={`#${proofRun.inferenceRequestId}`}
          />
          <ProofLink label="Claim Transaction" href={txExplorerUrl(proofRun.claimTx)} value="Payout settled" />
        </div>
      </section>

      <section className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-cyan-100">Machine-Readable Agent Interface</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
          Autonomous callers do not need the UI. They can discover markets with{' '}
          <code className="rounded bg-black/25 px-1.5 py-0.5">scanResolvableMarkets</code>,
          inspect action context with{' '}
          <code className="rounded bg-black/25 px-1.5 py-0.5">getAgentMarketContext</code>,
          and call{' '}
          <code className="rounded bg-black/25 px-1.5 py-0.5">requestResolution</code>
          with the reported top-up.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/api/agent-manifest"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-100"
          >
            Agent Manifest
          </Link>
          <Link
            href="/.well-known/autoresolve-agent.json"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-white/5"
          >
            Well-Known JSON
          </Link>
        </div>
      </section>
    </div>
  );
}

function ProofLink({
  label,
  href,
  value,
  external = true,
}: {
  label: string;
  href: string;
  value: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className="rounded-lg border border-white/10 bg-black/20 p-4 transition hover:border-cyan-400/30 hover:bg-black/30"
    >
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 break-all text-sm font-medium text-cyan-200">{value}</div>
    </a>
  );
}
