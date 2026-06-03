'use client';

import { useState } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { CreateMarketForm } from './CreateMarketForm';
import { GenerateMarketForm } from './GenerateMarketForm';

type Tab = 'manual' | 'ai';

export function CreateMarketTabs() {
  const [tab, setTab] = useState<Tab>('manual');

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Market creation mode"
        className="inline-flex rounded-xl border border-white/10 bg-black/40 p-1 shadow-inner"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'manual'}
          onClick={() => setTab('manual')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-300 ${
            tab === 'manual'
              ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-100 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Manual
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'ai'}
          onClick={() => setTab('ai')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-300 ${
            tab === 'ai'
              ? 'bg-gradient-to-r from-violet-500/20 to-cyan-500/20 text-violet-100 shadow-[0_0_15px_rgba(139,92,246,0.15)]'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Wand2 className="h-4 w-4" />
          AI-Generated
        </button>
      </div>

      {tab === 'manual' ? <CreateMarketForm /> : <GenerateMarketForm />}
    </div>
  );
}
