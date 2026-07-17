/**
 * Phase 0 — Design System Showcase
 * Demonstrates every shared component against the animated background.
 * Replaced by real pages in Phase 5.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Satellite, Map, Bell, Download, Shield, Activity, Anchor, Target,
} from 'lucide-react';
import {
  Button, Input, Card, Badge, StatCard, RoleBadge, SeverityPill,
  PageHeader, Tabs, Skeleton, EmptyState, ChartCard, Modal,
} from '@/components';
import { Toast } from '@/components/ui/Toast';

const STAGGER = { container: { animate: { transition: { staggerChildren: 0.08 } } } };
const FADE_UP = {
  initial:  { opacity: 0, y: 20 },
  animate:  { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

export function DesignShowcase() {
  const [modalOpen, setModalOpen] = useState(false);
  const [inputVal, setInputVal]   = useState('');

  return (
    <div className="min-h-screen pb-24">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="section-dark py-20 px-6 text-center relative overflow-hidden">
        {/* Reticle accent */}
        <div className="reticle absolute inset-8 pointer-events-none" />

        <motion.div
          className="relative z-10 max-w-3xl mx-auto"
          variants={STAGGER.container}
          initial="initial"
          animate="animate"
        >
          <motion.div variants={FADE_UP}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-ocean-200 text-xs font-mono mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse" />
              Phase 0 · Design System
            </div>
          </motion.div>

          <motion.h1 variants={FADE_UP} className="font-display text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Marine Plastic Tracker
          </motion.h1>

          <motion.p variants={FADE_UP} className="text-ocean-200 text-lg font-body mb-8 max-w-xl mx-auto leading-relaxed">
            AI-powered satellite detection &amp; 72-hour drift forecasting for the Indian Ocean.
            Running on free Sentinel-2 data — built for INCOIS, NCCR &amp; Coast Guard.
          </motion.p>

          <motion.div variants={FADE_UP} className="flex gap-3 justify-center flex-wrap">
            <Button
              variant="secondary"
              icon={<Satellite size={15} />}
              onClick={() => Toast.success('Demo mode active — real pipeline runs without paid keys.')}
            >
              Run Demo Pipeline
            </Button>
            <Button
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10"
              icon={<Map size={15} />}
              onClick={() => setModalOpen(true)}
            >
              View Sample Modal
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">

        {/* Page Header */}
        <PageHeader
          title="Design Token Preview"
          subtitle="Every component uses the ocean–teal–green token system. Glassmorphism cards, count-up stats, animated severity pills — all built and ready for Phase 5 pages."
          breadcrumbs={[{ label: 'Phase 0' }, { label: 'Components' }]}
          actions={
            <>
              <Button variant="ghost" size="sm" icon={<Download size={13} />}>Export</Button>
              <Button size="sm" icon={<Bell size={13} />}>Notify</Button>
            </>
          }
        />

        {/* Stat Cards */}
        <section>
          <h2 className="font-display text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Stat Cards (with count-up animation)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Detections"  value={247}   unit="pts" icon={<Target size={18} />}    color="ocean"   trend={12}  trendLabel="vs last month" delay={0} />
            <StatCard label="Active Hotspots"   value={4}     icon={<Activity size={18} />}   color="danger"  trend={-8}  trendLabel="vs last week"  delay={0.1} />
            <StatCard label="Operations Active" value={2}     icon={<Anchor size={18} />}     color="warn"    trend={25}  trendLabel="new this week"  delay={0.2} />
            <StatCard label="Plastic Recovered" value={189}   unit="kg" icon={<Shield size={18} />}     color="success" trend={34}  trendLabel="this month"    delay={0.3} />
          </div>
        </section>

        {/* Tabs + Card */}
        <section>
          <h2 className="font-display text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Tabs · Card · ChartCard
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card accent hoverable padding="lg">
              <Tabs
                variant="line"
                items={[
                  { key: 'detections', label: 'Detections', badge: 247 },
                  { key: 'hotspots',   label: 'Hotspots',   badge: 4 },
                  { key: 'ops',        label: 'Operations', badge: 2 },
                ]}
              />
              <p className="mt-4 text-sm text-slate-500 font-body">
                Tab content renders here in Phase 6. This card uses the glass + accent-bar + hoverable lift system.
              </p>
            </Card>

            <ChartCard
              title="Detection Trend"
              subtitle="Last 30 days · count per day"
              chartHeight={160}
              loading={false}
              footer="Source: Sentinel-2 imagery via Copernicus Open Access Hub"
            >
              {/* Placeholder bars — replaced by Recharts in Phase 6 */}
              <div className="flex items-end gap-1.5 h-full">
                {[40, 65, 30, 80, 55, 90, 45, 70, 60, 85].map((h, i) => (
                  <motion.div
                    key={i}
                    className="flex-1 rounded-t-sm bg-gradient-to-t from-ocean-600 to-ocean-400"
                    style={{ height: `${h}%` }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: i * 0.06, duration: 0.4 }}
                  />
                ))}
              </div>
            </ChartCard>
          </div>
        </section>

        {/* Badges, roles, severity */}
        <section>
          <h2 className="font-display text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Badges · Role Badges · Severity Pills
          </h2>
          <Card padding="lg">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="ocean">ocean</Badge>
                <Badge variant="success" dot>success</Badge>
                <Badge variant="warn">warn</Badge>
                <Badge variant="danger">danger</Badge>
                <Badge variant="purple">purple</Badge>
                <Badge variant="neutral">neutral</Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                {(['admin','coastguard','field'] as const).map(r => (
                  <RoleBadge key={r} role={r} />
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                {(['HIGH','MEDIUM','LOW','NONE'] as const).map(s => (
                  <SeverityPill key={s} severity={s} animated={s === 'HIGH'} />
                ))}
              </div>
            </div>
          </Card>
        </section>

        {/* Inputs + Buttons */}
        <section>
          <h2 className="font-display text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Inputs · Buttons
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card padding="lg" className="space-y-4">
              <Input
                label="Sentinel-2 Scene ID"
                placeholder="S2A_MSIL2A_20240415T…"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                hint="Copernicus Open Access Hub format"
              />
              <Input
                label="Confidence Threshold"
                placeholder="0.80"
                suffix="%"
                type="number"
                min={0}
                max={1}
                step={0.01}
              />
              <Input
                label="Access Restricted"
                placeholder="–"
                disabled
                hint="Requires Admin role"
              />
              <Input
                label="Error State"
                placeholder="Enter coordinates"
                error="Longitude must be between 60°E and 100°E"
                defaultValue="999"
              />
            </Card>

            <Card padding="lg" className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="success">Success</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="xs">XS</Button>
                <Button size="sm">SM</Button>
                <Button size="md">MD</Button>
                <Button size="lg">LG</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button loading>Loading…</Button>
                <Button disabled>Disabled</Button>
                <Button icon={<Bell size={14} />}>With Icon</Button>
                <Button
                  icon={<Download size={14} />}
                  onClick={() => Toast.info('Export queued. This would generate a PDF in Phase 7.')}
                >
                  Export
                </Button>
              </div>
              <Button
                fullWidth
                icon={<Satellite size={14} />}
                onClick={() => Toast.success('Pipeline trigger sent to BullMQ queue!')}
              >
                Trigger Full Pipeline
              </Button>
            </Card>
          </div>
        </section>

        {/* Skeleton + Empty State */}
        <section>
          <h2 className="font-display text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Skeleton · Empty State
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card padding="lg" className="space-y-3">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-2/3" />
              <div className="flex gap-3 pt-2">
                <Skeleton circle width={40} height={40} />
                <div className="flex-1 space-y-2 pt-1">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </Card>

            <EmptyState
              icon={<Map size={32} />}
              title="No Detections Found"
              description="No plastic detections match your current filters. Try widening the date range or reducing the confidence threshold."
              action={{ label: 'Reset Filters', variant: 'primary', onClick: () => {} }}
              secondaryAction={{ label: 'Run New Analysis', onClick: () => {} }}
            />
          </div>
        </section>

      </div>

      {/* ── Modal Example ─────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Sample Detection Detail"
        description="DET_001 · Mumbai NW · 23 Apr 2026"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Close</Button>
            <Button
              icon={<Download size={14} />}
              onClick={() => { Toast.success('Mission brief PDF exported.'); setModalOpen(false); }}
            >
              Export PDF
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm font-body">
          <div className="grid grid-cols-2 gap-4">
            {[
              ['Classification',   'Plastic (per-pixel MLP)'],
              ['Confidence',       '94.2%'],
              ['FDI Value',        '0.087'],
              ['Area',             '2.4 km²'],
              ['Coordinates',      '18.9600°N, 72.8200°E'],
              ['Days at Sea',      '3 days (est.)'],
              ['Severity',         'HIGH'],
              ['ETA to Coast',     '84 hours'],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">{k}</p>
                <p className="text-slate-800 font-medium">{v}</p>
              </div>
            ))}
          </div>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs leading-relaxed">
            ⚠️ Biofouling correction applied as an experimental heuristic. Not a validated correction — interpret with caution.
          </div>
        </div>
      </Modal>
    </div>
  );
}
