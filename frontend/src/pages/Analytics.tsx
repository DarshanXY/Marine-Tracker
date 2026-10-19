import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Cpu, Target, Gauge } from 'lucide-react';
import { PageHeader, ChartCard, Card, StatCard, Table, Badge, type ColumnDef } from '@/components';
import { useTrend, useByClass, useByRegion, useOverview, useModelEval, usePipelineStatus } from '@/hooks/useApi';
import type { RegionStat } from '@/types';

const CLASS_COLORS: Record<string, string> = {
  Plastic: '#0D9488', Algae: '#10B981', Sea_Foam: '#22D3EE', Water: '#94A3B8',
};
const tooltipStyle = {
  borderRadius: 12, border: '1px solid rgba(13,148,136,0.15)',
  boxShadow: '0 8px 32px rgba(13,148,136,0.12)', fontSize: 12,
};

export default function Analytics({ embedded = false }: { embedded?: boolean }) {
  const overview = useOverview();
  const trend = useTrend(60);
  const byClass = useByClass();
  const byRegion = useByRegion();
  const modelStatus = usePipelineStatus();
  const o = overview.data;
  // Prefer the engine's LIVE metrics so this card can never go stale.
  const metrics = modelStatus.data?.model?.metrics;
  const macroF1 = metrics?.macroF1 ?? o?.model.f1Score ?? null;
  const testAcc = metrics?.testAccuracy ?? null;

  const columns: ColumnDef<RegionStat>[] = [
    { key: 'code', header: 'Region', accessor: (r) => <span className="font-semibold text-slate-700">{r.code}</span> },
    { key: 'name', header: 'Name', accessor: (r) => <span className="text-slate-500">{r.name}</span> },
    { key: 'det', header: 'Detections', accessor: (r) => r.detections, sortable: true },
    { key: 'hot', header: 'Hotspots', accessor: (r) => r.hotspots, sortable: true },
    { key: 'high', header: 'High severity', accessor: (r) => r.highSeverity > 0 ? <Badge variant="danger">{r.highSeverity}</Badge> : <span className="text-slate-300">—</span> },
  ];

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Analytics"
          subtitle="Trends, classification mix, regional breakdown, and the active detection model."
        />
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Avg. confidence" value={o ? Math.round(o.avgConfidence * 100) : 0} unit="%" icon={<Gauge size={18} />} color="ocean" />
        <StatCard label="Total area" value={o?.totalAreaSqKm ?? 0} unit="km²" icon={<Target size={18} />} color="success" />
        <StatCard label="False-alarm rate" value={o ? Math.round((o.falseAlarms / Math.max(o.totalDetections, 1)) * 100) : 0} unit="%" icon={<Gauge size={18} />} color="warn" />
        <StatCard label="Model F1" value={macroF1 != null ? Math.round(macroF1 * 1000) / 10 : 0} unit="%" icon={<Cpu size={18} />} color="purple" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Detection trend" subtitle="Daily — last 60 days" className="lg:col-span-2" loading={trend.isLoading} chartHeight={260}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend.data ?? []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={(v: string) => v.slice(5)} minTickGap={28} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="detections" stroke="#0D9488" strokeWidth={2} dot={false} name="Detections" />
              <Line type="monotone" dataKey="confirmed" stroke="#2DD4BF" strokeWidth={2} dot={false} name="Confirmed" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Classification mix" loading={byClass.isLoading} chartHeight={260}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byClass.data ?? []} dataKey="count" nameKey="classification" innerRadius={50} outerRadius={82} paddingAngle={3}>
                {(byClass.data ?? []).map((c) => (
                  <Cell key={c.classification} fill={CLASS_COLORS[c.classification] ?? '#94A3B8'} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Regional breakdown" subtitle="Detections vs hotspot clusters by region" loading={byRegion.isLoading} chartHeight={260}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byRegion.data ?? []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#64748B' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(13,148,136,0.06)' }} />
            <Bar dataKey="detections" stackId="a" fill="#0D9488" name="Detections" radius={[0, 0, 0, 0]} />
            <Bar dataKey="hotspots" stackId="a" fill="#5EEAD4" name="Hotspots" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card accent padding="none" className="overflow-hidden lg:col-span-2">
          <div className="border-b border-border/60 px-4 py-3">
            <h3 className="font-display text-sm font-semibold text-slate-800">Region statistics</h3>
          </div>
          <Table columns={columns} data={byRegion.data ?? []} rowKey={(r) => r.code} loading={byRegion.isLoading} />
        </Card>

        <Card accent className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
            <Cpu size={15} className="text-purple-500" /> Active model
          </h3>
          <div className="rounded-xl bg-slate-50/70 p-4">
            <p className="font-display text-lg font-bold text-slate-800">{o?.model.name ?? '—'}</p>
            <p className="font-mono text-xs text-slate-400">{o?.model.version ?? ''}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <ModelStat label="Macro-F1" value={macroF1 != null ? macroF1.toFixed(3) : '—'} />
            <ModelStat label="Accuracy" value={testAcc != null ? `${Math.round(testAcc * 100)}%` : '—'} />
            <ModelStat label="Trained" value={metrics?.trainedOn ?? metrics?.dataset ?? 'MARIDA+MADOS'} />
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            {metrics?.arch ?? 'Per-pixel MLP'} over an 11-feature spectral contract (5 bands + FDI + 5 engineered
            indices), trained on the real MARIDA + MADOS benchmarks.
            {testAcc != null && macroF1 != null && (
              <> Held-out accuracy {Math.round(testAcc * 100)}%, macro-F1 {macroF1.toFixed(2)} on the combined test split.</>
            )}{' '}
            See <span className="font-medium text-slate-500">Model Health</span> for the confusion matrix and per-class metrics.
          </p>
          <ModelEvalTool />
        </Card>
      </div>
    </div>
  );
}

function ModelStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50/70 p-2.5">
      <p className="font-display text-sm font-bold text-slate-800">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

/** Live held-out evaluation — re-scores the shipped ONNX on a cached MARIDA/MADOS
 *  split on demand (via the engine's /model/evaluate). */
function ModelEvalTool() {
  const evalM = useModelEval();
  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-purple-800">Live held-out evaluation</span>
        <button
          type="button" onClick={() => evalM.mutate({ dataset: 'marida' })} disabled={evalM.isPending}
          className="rounded-lg border border-purple-200 bg-white px-2 py-1 text-[11px] font-semibold text-purple-700 disabled:opacity-50"
        >
          {evalM.isPending ? 'Scoring…' : 'MARIDA test'}
        </button>
        <button
          type="button" onClick={() => evalM.mutate({ dataset: 'mados' })} disabled={evalM.isPending}
          className="rounded-lg border border-purple-200 bg-white px-2 py-1 text-[11px] font-semibold text-purple-700 disabled:opacity-50"
        >
          {evalM.isPending ? 'Scoring…' : 'MADOS test'}
        </button>
      </div>
      {evalM.data && (
        <p className="mt-2 text-xs text-slate-600">
          <b>{evalM.data.dataset}</b> {evalM.data.split}: acc <b>{evalM.data.accuracy.toFixed(3)}</b>,
          {' '}macro-F1 <b>{evalM.data.macroF1.toFixed(3)}</b> over {evalM.data.samples.toLocaleString()} px
          <span className="text-[11px] text-slate-400"> (scored live on the shipped ONNX)</span>
        </p>
      )}
      {evalM.isError && <p className="mt-2 text-xs text-red-600">Evaluation unavailable — engine offline or split missing.</p>}
    </div>
  );
}
