import { Link } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ScanLine, CheckCircle2, Flame, Globe2, ArrowRight, BellRing, Check,
  Map as MapIcon, FileText, BarChart3, Cpu, type LucideIcon,
} from 'lucide-react';
import {
  PageHeader, StatCard, ChartCard, Card, SeverityPill, Badge, Table,
  type ColumnDef,
} from '@/components';
import {
  useOverview, useTrend, useByClass, useByRegion, useAlerts, useDetections, useAckAlert,
} from '@/hooks/useApi';
import { useAuthStore } from '@/stores/authStore';
import { LiveStatusRail } from '@/components/dashboard/LiveStatusRail';
import { formatCoords } from '@/lib/utils';
import type { Alert, Detection } from '@/types';

// Role-specific focus: what this user most likely needs first.
const ROLE_ACTIONS: Record<string, { desc: string; actions: { to: string; label: string; icon: LucideIcon }[] }> = {
  ADMIN: { desc: 'Full system oversight — pipeline health, analytics, and every region.',
    actions: [{ to: '/app/pipeline', label: 'Pipeline health', icon: Cpu }, { to: '/app/analytics', label: 'Analytics', icon: BarChart3 }, { to: '/app/reports', label: 'Reports', icon: FileText }] },
  COASTGUARD: { desc: 'Operational view — priority hotspots, coast ETAs, and live AOI scans.',
    actions: [{ to: '/app/hotspots', label: 'Priority hotspots', icon: Flame }, { to: '/app/map', label: 'Live AOI scan', icon: MapIcon }, { to: '/app/ops', label: 'Field operations', icon: BellRing }] },
  FIELD: { desc: 'Field view — what to verify next and where it is drifting.',
    actions: [{ to: '/app/map', label: 'Map', icon: MapIcon }, { to: '/app/detections', label: 'Pending detections', icon: ScanLine }, { to: '/app/alerts', label: 'Alerts', icon: BellRing }] },
};

const CLASS_COLORS: Record<string, string> = {
  Plastic: '#0D9488',
  Algae: '#10B981',
  Sea_Foam: '#22D3EE',
  Water: '#94A3B8',
};

export default function Dashboard() {
  const overview = useOverview();
  const trend = useTrend(30);
  const byClass = useByClass();
  const byRegion = useByRegion();
  const alerts = useAlerts();
  const recent = useDetections({ limit: 6 });
  const ack = useAckAlert();
  const user = useAuthStore((s) => s.user);

  const o = overview.data;
  const role = ROLE_ACTIONS[user?.role ?? ''] ?? null;

  const detColumns: ColumnDef<Detection>[] = [
    { key: 'region', header: 'Region', accessor: (d) => <span className="font-medium text-slate-700">{d.regionCode ?? '—'}</span> },
    { key: 'class', header: 'Class', accessor: (d) => <Badge variant={d.classification === 'Plastic' ? 'ocean' : 'neutral'}>{d.classification}</Badge> },
    { key: 'coords', header: 'Location', accessor: (d) => <span className="font-mono text-xs text-slate-500">{formatCoords(d.lat, d.lon)}</span> },
    { key: 'conf', header: 'Confidence', accessor: (d) => `${Math.round(d.confidence * 100)}%` },
    { key: 'status', header: 'Status', accessor: (d) => <StatusChip status={d.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={user ? `Welcome back, ${user.displayName.split(' ')[0]}` : 'Operations Dashboard'}
        subtitle={role?.desc ?? 'Live marine-plastic detections and drift forecasts across five Indian Ocean regions.'}
        badge={<Badge variant="ocean" dot>{o?.model.version ?? 'demo'}</Badge>}
      />

      {/* Role-specific quick actions */}
      {role && (
        <div className="flex flex-wrap gap-2">
          {role.actions.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/70 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-ocean-400 hover:text-ocean-700"
            >
              <Icon size={15} className="text-ocean-500" /> {label}
            </Link>
          ))}
        </div>
      )}

      {/* Live system status */}
      <LiveStatusRail />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total detections" value={o?.totalDetections ?? 0} icon={<ScanLine size={18} />} color="ocean" delay={0} />
        <StatCard label="Confirmed plastic" value={o?.plasticDetections ?? 0} icon={<CheckCircle2 size={18} />} color="success" delay={0.05} />
        <StatCard label="Active hotspots" value={o?.activeHotspots ?? 0} icon={<Flame size={18} />} color="danger" trend={o ? o.highSeverityHotspots : undefined} trendLabel="high severity" delay={0.1} />
        <StatCard label="Regions monitored" value={o?.regionsMonitored ?? 0} icon={<Globe2 size={18} />} color="purple" delay={0.15} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Detection trend" subtitle="Daily detections — last 30 days" className="lg:col-span-2" loading={trend.isLoading} chartHeight={260}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend.data ?? []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gDet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0D9488" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0D9488" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gConf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2DD4BF" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#2DD4BF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="detections" stroke="#0D9488" strokeWidth={2} fill="url(#gDet)" name="Detections" />
              <Area type="monotone" dataKey="confirmed" stroke="#2DD4BF" strokeWidth={2} fill="url(#gConf)" name="Confirmed" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="By classification" subtitle="Detection mix" loading={byClass.isLoading} chartHeight={260}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byClass.data ?? []} dataKey="count" nameKey="classification" innerRadius={52} outerRadius={82} paddingAngle={3}>
                {(byClass.data ?? []).map((c) => (
                  <Cell key={c.classification} fill={CLASS_COLORS[c.classification] ?? '#94A3B8'} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            {(byClass.data ?? []).map((c) => (
              <span key={c.classification} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_COLORS[c.classification] ?? '#94A3B8' }} />
                {c.classification.replace('_', ' ')} · {c.pct}%
              </span>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Detections by region" subtitle="Across monitored zones" className="lg:col-span-2" loading={byRegion.isLoading} chartHeight={240}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byRegion.data ?? []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(13,148,136,0.06)' }} />
              <Bar dataKey="detections" radius={[6, 6, 0, 0]} fill="#0D9488" name="Detections" />
              <Bar dataKey="hotspots" radius={[6, 6, 0, 0]} fill="#5EEAD4" name="Hotspots" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Alerts */}
        <Card accent padding="none" className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
              <BellRing size={15} className="text-ocean-600" /> Active alerts
            </h3>
            {o && <Badge variant="danger">{o.openAlerts} open</Badge>}
          </div>
          <div className="flex-1 divide-y divide-border/50 overflow-y-auto" style={{ maxHeight: 260 }}>
            {(alerts.data ?? []).slice(0, 5).map((a) => (
              <AlertRow key={a.id} alert={a} onAck={() => ack.mutate(a.id)} acking={ack.isPending} />
            ))}
            {alerts.data && alerts.data.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No active alerts.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Recent detections */}
      <Card accent padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="font-display text-sm font-semibold text-slate-800">Recent detections</h3>
          <Link to="/app/detections" className="inline-flex items-center gap-1 text-xs font-semibold text-ocean-600 hover:text-ocean-700">
            View all <ArrowRight size={13} />
          </Link>
        </div>
        <Table
          columns={detColumns}
          data={recent.data?.data ?? []}
          rowKey={(d) => d.id}
          loading={recent.isLoading}
          emptyMessage="No detections yet."
        />
      </Card>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid rgba(13,148,136,0.15)',
  boxShadow: '0 8px 32px rgba(13,148,136,0.12)',
  fontSize: 12,
};

function StatusChip({ status }: { status: Detection['status'] }) {
  const map = {
    CONFIRMED: 'success',
    PENDING: 'warn',
    FALSE_ALARM: 'neutral',
  } as const;
  return <Badge variant={map[status]}>{status.replace('_', ' ').toLowerCase()}</Badge>;
}

function AlertRow({ alert, onAck, acking }: { alert: Alert; onAck: () => void; acking: boolean }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <SeverityPill severity={alert.severity} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-700">{alert.title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{alert.message}</p>
      </div>
      {alert.isAcked ? (
        <span className="inline-flex items-center gap-1 text-xs text-success-700"><Check size={13} /> Ack</span>
      ) : (
        <button
          onClick={onAck}
          disabled={acking}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:border-ocean-300 hover:text-ocean-700 disabled:opacity-50"
        >
          Acknowledge
        </button>
      )}
    </div>
  );
}
