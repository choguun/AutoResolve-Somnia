import { CreateMarketTabs } from '@/components/markets/CreateMarketTabs';

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-2xl shadow-black/40 sm:p-10">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-cyan-500/10 pointer-events-none" />
        <div className="relative">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.2)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
            </span>
            New market
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-100 to-cyan-200 drop-shadow-sm">
            Create Market
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">
            Define a question manually, or let a Somnia AI agent design one for you from a topic.
            Either way, resolution runs autonomously when the timer expires.
          </p>
        </div>
      </div>
      <CreateMarketTabs />
    </div>
  );
}
