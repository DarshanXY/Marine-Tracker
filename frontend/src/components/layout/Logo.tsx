import { cn } from '@/lib/utils';

/** Wave-mark logo used in nav bars and the footer. */
export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-ocean-600 to-ocean-400 shadow-glow-primary">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M1 13 Q5 9 9 13 T18 13" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M1 9 Q5 5 9 9 T18 9" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.75" />
          <path d="M1 17 Q5 13 9 17 T18 17" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5" />
        </svg>
      </span>
      {showText && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-sm font-bold tracking-tight text-slate-900">
            Marine<span className="text-gradient">Tracker</span>
          </span>
          <span className="font-mono text-[10px] tracking-wider text-slate-400">Indian Ocean</span>
        </span>
      )}
    </span>
  );
}
