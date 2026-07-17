/**
 * Field Operations — the bridge from "the satellite detected plastic" to "a crew
 * was dispatched and filed a report". Reads are public; create / dispatch /
 * report actions require FIELD clearance or above (backend-enforced).
 */
import { useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { Activity, Plus, Recycle, Ship, Waves } from 'lucide-react';
import { PageHeader, Badge, Button, StatCard, EmptyState } from '@/components';
import { useOperations, useOperationStats, useUpdateOperationStatus } from '@/hooks/useApi';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { ROLE_LEVEL } from '@/types';
import { OperationCard } from '@/components/operations/OperationCard';
import { OperationForm } from '@/components/operations/OperationForm';
import { MissionReportForm } from '@/components/operations/MissionReportForm';
import { STATUS_META, STATUS_ORDER } from '@/components/operations/status';
import { cn } from '@/lib/utils';
import type { Operation, OperationStatus } from '@/types';

export default function Operations() {
  const [status, setStatus] = useState<OperationStatus | 'ALL'>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [reportFor, setReportFor] = useState<Operation | null>(null);

  const list = useOperations(status === 'ALL' ? {} : { status });
  const stats = useOperationStats();
  const advance = useUpdateOperationStatus();
  const user = useAuthStore((s) => s.user);
  const canManage = (user?.level ?? 0) >= ROLE_LEVEL.FIELD;

  const ops = list.data ?? [];
  const s = stats.data;
  const active = (s?.byStatus.DISPATCHED ?? 0) + (s?.byStatus.IN_PROGRESS ?? 0);

  const onAdvance = (op: Operation, next: OperationStatus) => {
    advance.mutate(
      { id: op.id, status: next },
      {
        onSuccess: () => toast.success(`${op.code} → ${STATUS_META[next].label}`),
        onError: () => toast.error('Update failed — check your clearance.'),
      },
    );
  };

  const onExport = (op: Operation) => {
    void api.exportOperationPdf(op.id, op.code).catch(() => toast.error('Export failed — is the backend up?'));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Field Operations"
        subtitle="Turn a detection or hotspot into a dispatched response — and track it to a filed mission report."
        badge={<Badge variant="ocean" dot>{s?.total ?? ops.length} total</Badge>}
        actions={
          canManage ? (
            <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
              New operation
            </Button>
          ) : undefined
        }
      />

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Activity size={18} />} color="warn" label="Active now" value={active} delay={0} />
        <StatCard icon={<Ship size={18} />} color="ocean" label="Total operations" value={s?.total ?? 0} delay={0.05} />
        <StatCard icon={<Recycle size={18} />} color="success" label="Plastic collected" value={s?.plasticCollectedKg ?? 0} unit="kg" delay={0.1} />
        <StatCard icon={<Waves size={18} />} color="ocean" label="Area cleared" value={s?.areaClearedSqKm ?? 0} unit="km²" delay={0.15} />
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={status === 'ALL'} onClick={() => setStatus('ALL')}>All</FilterChip>
        {STATUS_ORDER.map((st) => (
          <FilterChip key={st} active={status === st} onClick={() => setStatus(st)}>
            {STATUS_META[st].label}
            {s ? <span className="ml-1 opacity-60">{s.byStatus[st]}</span> : null}
          </FilterChip>
        ))}
      </div>

      {/* List */}
      {ops.length === 0 ? (
        <EmptyState
          icon={<Ship size={26} />}
          title={status === 'ALL' ? 'No operations yet' : `No ${STATUS_META[status].label.toLowerCase()} operations`}
          description={
            canManage
              ? 'Create an operation to dispatch a crew against a hotspot and track it to a filed report.'
              : 'When a crew is dispatched against a hotspot, it will appear here.'
          }
          action={canManage ? { label: 'New operation', icon: <Plus size={15} />, onClick: () => setCreateOpen(true) } : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ops.map((op) => (
            <OperationCard
              key={op.id}
              operation={op}
              canManage={canManage}
              busy={advance.isPending}
              onAdvance={(next) => onAdvance(op, next)}
              onFileReport={() => setReportFor(op)}
              onExport={() => onExport(op)}
            />
          ))}
        </div>
      )}

      <OperationForm open={createOpen} onClose={() => setCreateOpen(false)} />
      <MissionReportForm open={reportFor !== null} onClose={() => setReportFor(null)} operation={reportFor} />
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-ocean-500 bg-ocean-600 text-white shadow-glow-primary'
          : 'border-border bg-white/70 text-slate-600 hover:border-ocean-300 hover:text-ocean-700',
      )}
    >
      {children}
    </button>
  );
}
