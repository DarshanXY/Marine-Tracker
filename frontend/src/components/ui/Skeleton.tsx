import { type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps {
  className?: string;
  /** Circle shape — useful for avatars */
  circle?: boolean;
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
}

export function Skeleton({ className, circle = false, width, height, style }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton', circle ? 'rounded-full' : 'rounded-lg', className)}
      style={{ width, height, ...style }}
    />
  );
}

/** Pre-built skeleton layouts for common patterns */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="glass p-5 space-y-3">
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${90 - i * 10}%` }} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-4 pb-2 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${100 / cols}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 py-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4" style={{ width: `${100 / cols}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
