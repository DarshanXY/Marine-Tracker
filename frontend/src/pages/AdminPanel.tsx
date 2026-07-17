import { ShieldCheck, ShieldAlert, Users, Globe2, Server, KeyRound } from 'lucide-react';
import { PageHeader, Card, Badge, Table, RoleBadge, type ColumnDef, type Role } from '@/components';
import { useAdminUsers, usePipelineStatus, useRegions, useSatelliteStatus } from '@/hooks/useApi';
import { useAuthStore } from '@/stores/authStore';
import type { AdminUser } from '@/types';

export default function AdminPanel() {
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === 'ADMIN';

  const users = useAdminUsers();
  const regions = useRegions();
  const status = usePipelineStatus();
  const satellite = useSatelliteStatus();

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin Panel" subtitle="System administration — users, regions, and configuration." />
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <ShieldAlert size={30} className="text-amber-500" />
          <p className="font-display text-lg font-semibold text-slate-700">Administrators only</p>
          <p className="max-w-md text-sm text-slate-400">
            This page requires the ADMIN role (level 7). You are signed in as{' '}
            <span className="font-semibold text-slate-600">{me?.role ?? 'guest'}</span>.
            The backend enforces this independently — the API returns 403 for non-admin tokens.
          </p>
        </Card>
      </div>
    );
  }

  const userColumns: ColumnDef<AdminUser>[] = [
    {
      key: 'user', header: 'User',
      accessor: (u) => (
        <div>
          <p className="font-semibold text-slate-700">{u.displayName}</p>
          <p className="font-mono text-[11px] text-slate-400">{u.username} · {u.email}</p>
        </div>
      ),
    },
    { key: 'role', header: 'Role', accessor: (u) => <RoleBadge role={u.role.toLowerCase() as Role} /> },
    { key: 'level', header: 'Level', accessor: (u) => <span className="font-mono text-xs">L{u.level}</span>, sortable: true },
    {
      key: 'totp', header: '2FA',
      accessor: (u) => u.totpEnabled
        ? <Badge variant="success" dot>enabled</Badge>
        : <Badge variant="neutral">off</Badge>,
    },
  ];

  const engineUp = status.data?.engine === 'online';
  const queueUp = status.data?.queue?.state === 'up';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Panel"
        subtitle="Users, monitored regions, and live system configuration."
        badge={<Badge variant="success" dot>ADMIN · L7</Badge>}
      />

      {/* System config cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="space-y-1">
          <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-800">
            <Server size={15} className="text-ocean-600" /> Services
          </p>
          <p className="text-xs text-slate-500">Engine: <b className={engineUp ? 'text-success-700' : 'text-amber-600'}>{engineUp ? 'online' : 'offline'}</b></p>
          <p className="text-xs text-slate-500">Queue: <b className={queueUp ? 'text-success-700' : 'text-amber-600'}>{queueUp ? 'BullMQ up' : 'direct mode'}</b></p>
          <p className="text-xs text-slate-500">Classifier: <b>{status.data?.model?.mode ?? '—'}</b></p>
        </Card>
        <Card className="space-y-1">
          <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-800">
            <Globe2 size={15} className="text-ocean-600" /> Satellite
          </p>
          <p className="text-xs text-slate-500">Provider: <b>{satellite.data?.provider ?? '—'}</b></p>
          <p className="text-xs text-slate-500">Mode: <b className={satellite.data?.mode === 'live' ? 'text-success-700' : ''}>{satellite.data?.mode ?? '—'}</b></p>
          <p className="text-xs text-slate-500">Latest scene: <b className="font-mono text-[11px]">{satellite.data?.latestScene?.sceneId?.slice(0, 24) ?? '—'}</b></p>
        </Card>
        <Card className="space-y-1">
          <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-800">
            <KeyRound size={15} className="text-ocean-600" /> Scheduler
          </p>
          <p className="text-xs text-slate-500">Endpoint: <code className="font-mono text-[11px]">GET /api/pipeline/scheduled-run</code></p>
          <p className="text-xs text-slate-500">Suggested cadence: every 6 h (Sentinel-2 revisit ≈ 5 days)</p>
          <p className="text-xs text-slate-500">Guard: set <code className="font-mono text-[11px]">SCHEDULER_TOKEN</code> before public exposure</p>
        </Card>
      </div>

      {/* Users */}
      <Card accent padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
            <Users size={15} className="text-ocean-600" /> Users &amp; roles
          </h3>
          <Badge variant="ocean">{users.data?.length ?? 0}</Badge>
        </div>
        {users.isError ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">
            Could not load users — your session may lack a valid admin token. Sign out and back in as <b>admin</b>.
          </p>
        ) : (
          <Table
            columns={userColumns}
            data={users.data ?? []}
            rowKey={(u) => u.id}
            loading={users.isLoading}
            emptyMessage="No users."
          />
        )}
      </Card>

      {/* Regions */}
      <Card accent padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
            <ShieldCheck size={15} className="text-ocean-600" /> Monitored regions
          </h3>
          <Badge variant="ocean">{regions.data?.length ?? 0}</Badge>
        </div>
        <div className="divide-y divide-border/50">
          {(regions.data ?? []).map((r) => (
            <div key={r.code} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-12 font-mono text-xs font-bold text-ocean-700">{r.code}</span>
              <span className="font-medium text-slate-700">{r.displayName}</span>
              <span className="ml-auto font-mono text-[11px] text-slate-400">
                {r.centerLat.toFixed(2)}, {r.centerLon.toFixed(2)} · z{r.zoomLevel}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
