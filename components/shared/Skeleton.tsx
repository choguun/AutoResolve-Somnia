import React from 'react';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-white/5 backdrop-blur-sm ${className}`}
      {...props}
    />
  );
}

export function MarketCardSkeleton() {
  return (
    <div className="flex min-h-[220px] flex-col justify-between rounded-2xl border border-white/5 bg-white/5 p-6 backdrop-blur-md">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="mb-2 h-6 w-3/4" />
        <Skeleton className="mb-4 h-6 w-1/2" />
        <Skeleton className="h-4 w-full opacity-50" />
        <Skeleton className="mt-2 h-4 w-4/5 opacity-50" />
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}
