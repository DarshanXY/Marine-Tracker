import { type ReactNode, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InfoTipProps {
  /** If given, this word becomes the trigger (dotted underline). Otherwise a small “?” icon is shown. */
  term?: ReactNode;
  /** The plain-language explanation shown in the bubble. */
  children: ReactNode;
  className?: string;
  /** Tooltip width in px (default 220). */
  width?: number;
}

/**
 * InfoTip — guided-help affordance used across the app to keep the interface
 * friendly without losing scientific accuracy: show the plain word, tuck the
 * precise/technical definition into a hover-or-tap bubble. Works on hover,
 * keyboard focus, and touch (tap to toggle).
 */
export function InfoTip({ term, children, className, width = 220 }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn('group relative inline-flex items-center align-middle', className)}
      tabIndex={0}
      role="button"
      aria-label={typeof term === 'string' ? `${term} — what this means` : 'What this means'}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((v) => !v); }}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
    >
      {term ? (
        <span className="cursor-help underline decoration-dotted decoration-slate-400 underline-offset-2">{term}</span>
      ) : (
        <HelpCircle size={13} className="ml-0.5 cursor-help text-slate-400 transition-colors group-hover:text-ocean-600" />
      )}
      <span
        role="tooltip"
        style={{ width }}
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-border bg-white/95 px-3 py-2',
          'text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-slate-600 shadow-glass backdrop-blur',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
          open && 'opacity-100',
        )}
      >
        {children}
      </span>
    </span>
  );
}
