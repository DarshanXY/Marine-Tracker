import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Satellite, ArrowRight, Waves, ScanLine, Boxes, Wind, BellRing,
  ShieldCheck, Map as MapIcon, Cpu, Globe2, LineChart,
} from 'lucide-react';
import { StatCard } from '@/components';
import { useOverview } from '@/hooks/useApi';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

const PIPELINE = [
  { icon: Satellite, title: 'Ingest', desc: 'Free Sentinel-2 L2A scenes over Indian coasts.' },
  { icon: LineChart, title: 'FDI', desc: 'Floating Debris Index flags candidate pixels.' },
  { icon: Cpu, title: 'Classify', desc: 'A per-pixel neural net (MARIDA+MADOS-trained) separates plastic from algae/foam.' },
  { icon: Boxes, title: 'Cluster', desc: 'DBSCAN groups detections into hotspots.' },
  { icon: Wind, title: 'Forecast', desc: '72-h Lagrangian drift with an uncertainty cone.' },
  { icon: BellRing, title: 'Alert', desc: 'Coastal-landfall ETAs to the right teams.' },
];

const FEATURES = [
  { icon: MapIcon, title: 'Interactive map', desc: 'Detections and hotspot clusters on a live Leaflet map, filtered by region.' },
  { icon: ScanLine, title: 'Explainable detections', desc: 'Every candidate carries its FDI value, CNN confidence, and validation status.' },
  { icon: Wind, title: 'Drift forecasts', desc: 'Ensemble Lagrangian trajectories show where plastic is heading, not just where it is.' },
  { icon: Globe2, title: 'Five regions', desc: 'Mumbai, Goa, Kochi, Chennai, and the Andaman Sea — extensible to any coast.' },
  { icon: ShieldCheck, title: 'Runs at ₹0', desc: 'Built entirely on free tiers and open data — architected to scale to production.' },
  { icon: Cpu, title: 'Model registry', desc: 'Versioned weights with F1/precision/recall — reproducible and auditable.' },
];

export default function Landing() {
  const overview = useOverview();
  const o = overview.data;

  return (
    <div className="overflow-hidden">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl px-6 pb-20 pt-16 lg:pt-24">
        <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ duration: 0.5 }} className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-ocean-200 bg-ocean-50 px-4 py-1.5 text-xs font-semibold text-ocean-700">
            <Satellite size={13} /> Sentinel-2 · AI detection · drift forecasting
          </span>
          <h1 className="mt-6 font-display text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            See marine plastic <span className="text-gradient">from space</span> — and where it drifts next
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-500">
            An honest pilot that turns free satellite imagery into plastic detections and
            72-hour drift forecasts for the Indian Ocean — built to support patrols and field
            teams, not replace them.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/app" className="inline-flex items-center gap-2 rounded-xl bg-ocean-600 px-6 py-3 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5">
              Open the dashboard <ArrowRight size={16} />
            </Link>
            <Link to="/about" className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/70 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-ocean-300 hover:text-ocean-700">
              How it works
            </Link>
          </div>
          <p className="mt-6 text-xs uppercase tracking-wider text-slate-400">
            Designed for INCOIS · NCCR · Indian Coast Guard
          </p>
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
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold text-slate-900">From pixels to patrol-ready intel</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-500">A transparent six-stage pipeline — each step is inspectable and reproducible.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {PIPELINE.map((step, i) => (
            <motion.div
              key={step.title}
              initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}
              transition={{ duration: 0.4, delay: i * 0.06 }}
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
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold text-slate-900">Everything a coastal team needs</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}
              transition={{ duration: 0.4, delay: i * 0.05 }}
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
        </div>
      </section>

      {/* ── CTA band ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="section-dark relative overflow-hidden rounded-3xl px-8 py-14 text-center"
        >
          <div className="relative z-10">
            <h2 className="font-display text-3xl font-bold text-white">Explore the live pilot</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/80">
              Jump into the operations dashboard — detections, hotspots, drift forecasts, and analytics,
              all running on free open data.
            </p>
            <Link to="/app" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-ocean-700 transition-transform hover:-translate-y-0.5">
              Open dashboard <ArrowRight size={16} />
            </Link>
          </div>
          <Waves aria-hidden className="absolute -bottom-6 -right-6 h-40 w-40 text-white/10" />
        </motion.div>
      </section>
    </div>
  );
}
