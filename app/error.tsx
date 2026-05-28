'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global Error Boundary caught an error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-8 backdrop-blur-xl shadow-[0_0_40px_rgba(244,63,94,0.15)] max-w-lg w-full">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/20 shadow-inner">
          <svg className="h-8 w-8 text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="mb-3 text-2xl font-bold text-white drop-shadow-sm">Something went wrong</h2>
        <p className="mb-8 text-sm text-rose-200/80">
          We encountered an unexpected error while rendering this page.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => reset()}
            className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-rose-400 to-rose-500 px-6 py-3 font-bold text-rose-950 shadow-[0_0_15px_rgba(251,113,133,0.3)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(251,113,133,0.5)]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto rounded-xl border border-white/10 bg-white/5 px-6 py-3 font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:bg-white/10 hover:border-white/20"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
