import { cn } from '@/lib/utils';

export type Role =
  | 'admin'
  | 'coastguard'
  | 'field';

const ROLE_META: Record<Role, { label: string; color: string; bg: string; border: string }> = {
  admin:       { label: 'Administrator',       color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
  coastguard:  { label: 'Coast Guard',         color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
  field:       { label: 'Field Officer',       color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
};

export interface RoleBadgeProps {
  role: Role;
  /** Show the full label (default) or just the role initials */
  compact?: boolean;
  className?: string;
}

export function RoleBadge({ role, compact = false, className }: RoleBadgeProps) {
  const meta = ROLE_META[role];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full',
        'text-xs font-semibold font-body tracking-wide',
        className,
      )}
      style={{
        color: meta.color,
        backgroundColor: meta.bg,
        border: `1px solid ${meta.border}`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: meta.color }}
      />
      {compact
        ? meta.label.split(' ').map(w => w[0]).join('').toUpperCase()
        : meta.label}
    </span>
  );
}
