import { cn } from '@/lib/utils';

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

const SEVERITY_META: Record<Severity, { label: string; color: string; bg: string; border: string; pulse: string }> = {
  HIGH:   { label: 'HIGH',   color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', pulse: '#EF4444' },
  MEDIUM: { label: 'MEDIUM', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', pulse: '#F59E0B' },
  LOW:    { label: 'LOW',    color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', pulse: '#10B981' },
  NONE:   { label: 'NONE',   color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', pulse: '#CBD5E1' },
};

export interface SeverityPillProps {
  severity: Severity;
  /** Show animated pulse dot */
  animated?: boolean;
  className?: string;
}

export function SeverityPill({ severity, animated = false, className }: SeverityPillProps) {
  const meta = SEVERITY_META[severity];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
        'text-xs font-bold font-mono tracking-widest uppercase',
        className,
      )}
      style={{ color: meta.color, backgroundColor: meta.bg, border: `1px solid ${meta.border}` }}
    >
      <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
        {animated && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ backgroundColor: meta.pulse }}
          />
        )}
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: meta.pulse }}
        />
      </span>
      {meta.label}
    </span>
  );
}
