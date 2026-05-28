import React from 'react';
import Link from 'next/link';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({ title, description, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-white/5 bg-black/20 p-8 text-center backdrop-blur-md shadow-inner">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 shadow-inner">
        <svg
          className="h-8 w-8 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      </div>
      <h3 className="mb-2 text-xl font-semibold text-white drop-shadow-sm">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-zinc-400">{description}</p>
      
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3 font-semibold text-white shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(139,92,246,0.5)]"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
