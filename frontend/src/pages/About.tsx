import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Satellite, Cpu, Wind, ShieldAlert, ShieldCheck, ArrowRight, Database, CheckCircle2 } from 'lucide-react';
import { useSatelliteStatus } from '@/hooks/useApi';
import { Badge } from '@/components';
import { reveal } from '@/lib/motion';

const METHOD = [
  {
    icon: Satellite,
    title: 'Floating Debris Index (FDI)',
    body: 'FDI uses Sentinel-2 near-infrared and red-edge bands to highlight material floating on water. Pixels above threshold that also form a spatial cluster become detection candidates — this cheaply narrows millions of pixels to a handful of leads.',
  },
  {
    icon: Cpu,
    title: 'MLP ensemble classification',
    body: 'A 3-seed per-pixel neural-net (MLP) ensemble, trained on the real MARIDA and MADOS benchmarks, scores each candidate across Plastic / Algae / Sea-Foam / Water from its 11-feature spectral signature. It reaches ~0.82 macro-F1 held-out; only the calibrated HIGH-confidence tier (~90% precision) drives hotspots and dispatch. The model assists an analyst — it does not decide alone.',
  },
  {
    icon: ShieldCheck,
    title: 'Clay foundation-model verification',
    body: 'Each plastic hotspot gets a second opinion from a frozen Clay v1.5 foundation model running live on a GPU, which marks it CONFIRMED or POSSIBLE. Clay is a precision gate — lifting plastic precision toward ~0.92 — not a lone detector. Analysts keep the final call.',
  },
  {
    icon: Wind,
    title: 'Lagrangian drift forecast',
    body: 'Confirmed plastic is advected forward 72 hours using an ensemble of real ocean-current + windage scenarios (windage 1.5–3%). The output is an uncertainty cone, not a single line — honest about what a forecast can and cannot promise.',
  },
];

export default function About() {
  const sat = useSatelliteStatus();

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <span className="inline-flex items-center gap-2 rounded-full border border-ocean-200 bg-ocean-50 px-4 py-1.5 text-xs font-semibold text-ocean-700">
          About &amp; method
        </span>
        <h1 className="mt-5 font-display text-4xl font-black tracking-tight text-slate-900">
          Free satellites, honest science
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-500">
          Marine Plastic Tracker is a Final Year Project demonstrating that open Sentinel-2
          imagery, classical remote-sensing indices, a compact MLP ensemble, and a foundation-model
          verifier can produce genuinely useful marine-plastic intelligence for Indian coastal
          agencies — at zero running cost.
        </p>
      </motion.div>

      {/* Honesty callout */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        className="glass card-accent relative mt-10 flex gap-4 p-6"
      >
        <ShieldAlert className="mt-0.5 flex-shrink-0 text-warn" size={22} />
        <div>
          <h3 className="font-display text-base font-bold text-slate-800">What this is — and isn't</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            This is a decision-support pilot. Sentinel-2 revisits every ~5 days at 10 m resolution and
            can't see under clouds or at night — so it complements patrols, drones, and field reports;
            it does not replace them. Every number here is traceable to its source pixel and model score.
          </p>
        </div>
      </motion.div>

      {/* Method */}
      <div className="mt-12 space-y-6">
        {METHOD.map((m, i) => (
          <motion.div
            key={m.title}
            {...reveal(i * 0.06)}
            whileHover={{ y: -4 }}
            className="glass relative flex gap-5 p-6"
          >
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ocean-600 to-ocean-400 text-white shadow-glow-primary">
              <m.icon size={22} />
            </span>
            <div>
              <h3 className="font-display text-lg font-bold text-slate-800">{m.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{m.body}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Data source status */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        className="glass card-accent relative mt-8 p-6"
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-slate-800">
            <Database size={18} className="text-ocean-600" /> Satellite data source
          </h3>
          <Badge variant={sat.data?.mode === 'live' ? 'success' : 'ocean'}>
            {sat.data?.mode ?? 'demo'}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-slate-500">{sat.data?.message ?? 'Loading provider status…'}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SourceCard active title="Copernicus Data Space" body="Official free Sentinel-2 access (Sentinel Hub OAuth2). Replaced the retired SciHub." />
          <SourceCard title="Element84 Earth Search" body="Public AWS Open Data STAC — Sentinel-2 L2A with no API key required." />
        </div>
      </motion.div>

      {/* Tech stack */}
      <div className="mt-8 flex flex-wrap gap-2">
        {['PostgreSQL + PostGIS', 'Prisma', 'Node + Express', 'FastAPI', 'React + Vite', 'Leaflet', 'BullMQ + Redis'].map((t) => (
          <span key={t} className="rounded-full border border-border bg-white/70 px-3 py-1 text-xs font-medium text-slate-500">{t}</span>
        ))}
      </div>

      <div className="mt-12 text-center">
        <Link to="/app" className="inline-flex items-center gap-2 rounded-xl bg-ocean-600 px-6 py-3 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5">
          Explore the dashboard <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function SourceCard({ title, body, active = false }: { title: string; body: string; active?: boolean }) {
  return (
    <div className="rounded-xl border border-border/70 bg-white/60 p-4">
      <div className="flex items-center gap-2">
        {active && <CheckCircle2 size={15} className="text-success-500" />}
        <p className="font-display text-sm font-bold text-slate-800">{title}</p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}
