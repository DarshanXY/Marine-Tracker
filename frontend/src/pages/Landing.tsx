import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Satellite, ArrowRight, Waves, ScanLine, Boxes, Wind, BellRing,
  ShieldCheck, Map as MapIcon, Cpu, Globe2, LineChart, Sparkles,
  Bookmark, GraduationCap,
} from 'lucide-react';
import { StatCard } from '@/components';
import { useOverview } from '@/hooks/useApi';
import { fadeUp, reveal, staggerContainer } from '@/lib/motion';

// The real live pipeline (see Map Explorer / main_pipeline.py): seven inspectable
// stages, MLP ensemble + a Clay foundation-model verifier before drift.
const PIPELINE = [
  { icon: Satellite, title: 'Ingest', desc: 'Free Sentinel-2 L2A scenes over Indian coasts, cloud-graded per pass.' },
  { icon: LineChart, title: 'FDI', desc: 'Floating Debris Index flags candidate pixels from NIR/red-edge/SWIR.' },
  { icon: Cpu, title: 'Classify', desc: 'A 3-seed per-pixel MLP ensemble (MARIDA+MADOS) separates plastic from algae / foam / water.' },
  { icon: Boxes, title: 'Cluster', desc: 'DBSCAN groups high-confidence plastic into ranked hotspots.' },
  { icon: ShieldCheck, title: 'Verify', desc: 'A Clay v1.5 foundation model gives each hotspot a 2nd opinion (~0.92 precision).' },
  { icon: Wind, title: 'Forecast', desc: '72-h Lagrangian drift with a real uncertainty cone.' },
  { icon: BellRing, title: 'Alert', desc: 'Coastal-landfall ETAs routed to the right teams.' },
];

const FEATURES = [
  { icon: MapIcon, title: 'Live interactive map', desc: 'Detections and hotspot clusters on a real Leaflet satellite map, colour-coded per class and filtered by region.' },
  { icon: ScanLine, title: 'Two-tier confident detections', desc: 'Every candidate carries its FDI value and MLP confidence; only the calibrated HIGH tier (~90% precise) drives dispatch.' },
  { icon: ShieldCheck, title: 'Clay foundation-model verifier', desc: 'A frozen Clay v1.5 model re-scores each plastic hotspot as CONFIRMED or POSSIBLE — a precision gate, not a lone detector.' },
  { icon: Wind, title: '72-hour drift forecasts', desc: 'Ensemble Lagrangian trajectories on real currents + winds show where plastic is heading, as a cone — not a false single line.' },
  { icon: Bookmark, title: 'Saved areas & change tracking', desc: 'Keep an AOI, re-scan the same water over time, and forecast its drift — history kept so runs stay comparable.' },
  { icon: GraduationCap, title: 'Active-learning loop', desc: 'Analyst labels on real detections feed back into the model — the pilot is designed to get better with use.' },
];

// Honest headline numbers — see the model card in AI Lab. Lead with macro-F1
// (accuracy is Water-inflated), never overclaim plastic detection.
const METRICS = [
  { value: '0.82', label: 'macro-F1 (held-out MARIDA+MADOS)' },
  { value: '~90%', label: 'precision at the HIGH-confidence tier' },
  { value: '₹0', label: 'running cost — free tiers + open data' },
];

export default function Landing() {
  const overview = useOverview();
  const o = overview.data;

  return (
    <div className="overflow-hidden">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl px-6 pb-20 pt-16 lg:pt-24">
        <motion.div
          initial="hidden"
          animate="show"
          variants={staggerContainer(0.12)}
          className="mx-auto max-w-3xl text-center"
        >
          <motion.span
            variants={fadeUp}
            className="inline-flex items-center gap-2 rounded-full border border-ocean-200 bg-ocean-50 px-4 py-1.5 text-xs font-semibold text-ocean-700"
          >
            <Satellite size={13} /> Sentinel-2 · AI detection · drift forecasting
          </motion.span>
          <motion.h1
            variants={fadeUp}
            className="mt-6 font-display text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl"
          >
            See marine plastic <span className="text-gradient">from space</span> — and where it drifts next
          </motion.h1>
          <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-500">
            An honest pilot that turns free satellite imagery into plastic detections and
            72-hour drift forecasts for the Indian Ocean — built to support patrols and field
            teams, not replace them.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/app" className="group inline-flex items-center gap-2 rounded-xl bg-ocean-600 px-6 py-3 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5">
              Open the dashboard <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link to="/about" className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/70 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-ocean-300 hover:text-ocean-700">
              How it works
            </Link>
          </motion.div>
          <motion.p variants={fadeUp} className="mt-6 text-xs uppercase tracking-wider text-slate-400">
            Designed for INCOIS · NCCR · Indian Coast Guard
          </motion.p>
        </motion.div>

        {/* Floating reticle accents */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-6 top-24 hidden h-24 w-24 rounded-2xl border border-ocean-200/60 lg:block"
          animate={{ y: [0, -16, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute right-10 top-40 hidden h-16 w-16 rounded-full border border-ocean-300/50 lg:block"
          animate={{ y: [0, 14, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
      </section>

      {/* ── Live stats (connected to the backend) ────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <motion.p
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
          className="mb-4 flex items-center justify-center gap-2 text-center text-xs font-semibold uppercase tracking-wider text-ocean-600"
        >
          <Waves size={14} /> Live from the pilot
        </motion.p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Detections" value={o?.totalDetections ?? 0} icon={<ScanLine size={18} />} color="ocean" />
          <StatCard label="Confirmed plastic" value={o?.plasticDetections ?? 0} icon={<ShieldCheck size={18} />} color="success" delay={0.05} />
          <StatCard label="Active hotspots" value={o?.activeHotspots ?? 0} icon={<Boxes size={18} />} color="danger" delay={0.1} />
          <StatCard label="Regions" value={o?.regionsMonitored ?? 0} icon={<Globe2 size={18} />} color="purple" delay={0.15} />
        </div>
      </section>

      {/* ── Pipeline ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <motion.div {...reveal()} className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold text-slate-900">From pixels to patrol-ready intel</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-500">A transparent seven-stage pipeline — each step is inspectable, reproducible, and runs live for your selection.</p>
        </motion.div>
        <motion.div
          initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer(0.06)}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
        >
          {PIPELINE.map((step, i) => (
            <motion.div
              key={step.title}
              variants={fadeUp}
              whileHover={{ y: -4 }}
              className="glass card-accent relative p-5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-600">
                <step.icon size={20} />
              </span>
              <p className="mt-3 font-mono text-[11px] text-ocean-500">STEP {i + 1}</p>
              <p className="font-display text-base font-bold text-slate-800">{step.title}</p>
              <p className="mt-1 text-sm text-slate-500">{step.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <motion.div {...reveal()} className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold text-slate-900">Everything a coastal team needs</h2>
        </motion.div>
        <motion.div
          initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer(0.06)}
          className="grid gap-5 md:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              whileHover={{ y: -4 }}
              className="glass relative p-6"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-ocean-600 to-ocean-400 text-white shadow-glow-primary">
                <f.icon size={20} />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-slate-800">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Honest metrics band ──────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-4">
        <motion.div {...reveal()} className="glass card-accent relative overflow-hidden p-8">
          <p className="flex items-center justify-center gap-2 text-center text-xs font-semibold uppercase tracking-wider text-ocean-600">
            <Sparkles size={14} /> Measured, not marketed
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {METRICS.map((m, i) => (
              <motion.div key={m.label} {...reveal(i * 0.08)} className="text-center">
                <p className="font-display text-4xl font-black text-gradient">{m.value}</p>
                <p className="mx-auto mt-1.5 max-w-[26ch] text-xs leading-relaxed text-slate-500">{m.label}</p>
              </motion.div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed text-slate-400">
            Sentinel-2 detects aggregate optical signatures, not individual items — so we report confident
            leads for humans to verify, and publish the real held-out numbers rather than a hero accuracy.
          </p>
        </motion.div>
      </section>

      {/* ── CTA band ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <motion.div
          {...reveal()}
          className="section-dark relative overflow-hidden rounded-3xl px-8 py-14 text-center"
        >
          <div className="relative z-10">
            <h2 className="font-display text-3xl font-bold text-white">Explore the live pilot</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/80">
              Jump into the operations dashboard — detections, hotspots, drift forecasts, and analytics,
              all running on free open data.
            </p>
            <Link to="/app" className="group mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-ocean-700 transition-transform hover:-translate-y-0.5">
              Open dashboard <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <motion.div
            aria-hidden
            className="absolute -bottom-6 -right-6"
            animate={{ y: [0, -10, 0] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Waves className="h-40 w-40 text-white/10" />
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}
