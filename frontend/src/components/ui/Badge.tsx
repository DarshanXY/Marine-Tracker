import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant =
  | 'ocean'    // teal / primary
  | 'success'
  | 'warn'
  | 'danger'
  | 'purple'
  | 'neutral'
  | 'sky';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  ocean:   'bg-ocean-100 text-ocean-800 border border-ocean-300',
  success: 'bg-success-100 text-success-700 border border-success-400/40',
  warn:    'bg-amber-100 text-amber-700 border border-amber-300',
  danger:  'bg-red-100 text-red-700 border border-red-300',
  purple:  'bg-purple-100 text-purple-700 border border-purple-300',
  neutral: 'bg-slate-100 text-slate-600 border border-slate-200',
  sky:     'bg-sky-100 text-sky-700 border border-sky-200',
};

const dotColors: Record<BadgeVariant, string> = {
  ocean:   'bg-ocean-600',
  success: 'bg-success-500',
  warn:    'bg-warn',
  danger:  'bg-danger',
  purple:  'bg-purple',
  neutral: 'bg-slate-400',
  sky:     'bg-sky-400',
};

export function Badge({ variant = 'ocean', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5',
        'rounded-full text-xs font-semibold font-body tracking-wide uppercase',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotColors[variant])} />
      )}
      {children}
    </span>
  );
}
