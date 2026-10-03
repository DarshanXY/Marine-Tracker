import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Satellite,
  Waves,
  Cpu,
  Boxes,
  Wind,
  BellRing,
  Database,
  Terminal,
  Server,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { Card, Badge } from '@/components';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'pipeline', label: 'The 7-stage pipeline' },
  { id: 'sources', label: 'Data sources' },
  { id: 'api', label: 'REST API reference' },
  { id: 'quickstart', label: 'Getting started' },
];

const PIPELINE = [
  {
    icon: Satellite,
    title: 'Ingest Sentinel-2',
    body: 'Pull the latest cloud-filtered L2A tiles for a requested Indian-Ocean region via STAC. Bands B2–B12 are cropped, reprojected, and cached as a scene ready for indexing.',
  },
  {
    icon: Waves,
    title: 'Floating Debris Index (FDI)',
    body: 'Compute FDI from NIR / red-edge / SWIR reflectance to highlight material floating on water. Pixels above threshold cheaply narrow millions of pixels to a few candidate patches.',
  },
  {
    icon: Cpu,
    title: 'MLP classify',
    body: 'A 3-seed per-pixel MLP ensemble, trained on the real MARIDA + MADOS benchmarks, scores each candidate across Plastic / Algae / Sea-Foam / Water from an 11-feature spectral signature (~0.82 macro-F1 held-out; accuracy is Water-inflated so we lead with macro-F1). A calibrated HIGH-confidence tier (~90% precision) is what promotes a detection.',
  },
  {
    icon: Boxes,
    title: 'DBSCAN hotspots',
    body: 'High-confidence detections are clustered in geographic space with DBSCAN, collapsing scattered pixels into ranked hotspot polygons with a density and confidence score.',
  },
  {
    icon: ShieldCheck,
    title: 'Clay verify',
    body: 'A frozen Clay v1.5 foundation model (GPU sidecar) re-embeds each plastic hotspot and returns a CONFIRMED / POSSIBLE verdict — a second opinion that lifts plastic precision toward ~0.92. It gates candidates; it never detects on its own.',
  },
  {
    icon: Wind,
    title: 'Lagrangian drift',
    body: 'Each hotspot is advected forward 72 hours over an ensemble of real ocean-current + windage (1.5–3%) scenarios, producing an uncertainty cone rather than a single deterministic track.',
  },
  {
    icon: BellRing,
    title: 'Alerts',
    body: 'Hotspots crossing severity thresholds or drifting toward sensitive zones raise alerts for partner agencies — a lead to verify with patrols or drones, never an automated verdict.',
  },
];

const SOURCES = [
  {
    active: true,
    title: 'Copernicus Data Space Ecosystem',
    body: 'Primary free Sentinel-2 access through Sentinel Hub OAuth2. This is the official successor to the retired SciHub and needs a free Copernicus account.',
  },
  {
    active: false,
    title: 'AWS STAC fallback',
    body: 'Element84 Earth Search on the AWS Open Data registry — public Sentinel-2 L2A with no API key. Used automatically when Copernicus is rate-limited or unreachable.',
  },
  {
    active: false,
    title: 'Demo mode',
    body: 'With no credentials configured the platform serves deterministic sample scenes and detections, so the full pipeline and UI stay explorable at ₹0 and fully offline.',
  },
];

type Method = 'GET' | 'POST';
const ENDPOINTS: { method: Method; path: string; desc: string }[] = [
  { method: 'GET', path: '/api/stats/overview', desc: 'Aggregate counts — detections, hotspots, active alerts, scenes processed.' },
  { method: 'GET', path: '/api/detections', desc: 'Paginated plastic detections with class scores, geometry, and scene metadata.' },
  { method: 'GET', path: '/api/hotspots', desc: 'Ranked DBSCAN hotspot clusters with density, confidence, and drift cones.' },
  { method: 'GET', path: '/api/regions', desc: 'Monitored Indian-Ocean regions and their latest processing status.' },
  { method: 'GET', path: '/api/alerts', desc: 'Open and historical alerts with severity, target zone, and issue time.' },
  { method: 'POST', path: '/api/pipeline/run', desc: 'Run the full ingest → detect → verify → forecast pipeline for a region or drawn AOI (auth required).' },
  { method: 'GET', path: '/api/pipeline/stream', desc: 'Server-sent live scan of a drawn AOI — one event per pipeline stage.' },
  { method: 'GET', path: '/api/areas', desc: 'Saved study areas with their latest scan and 72-hour drift forecast history.' },
  { method: 'POST', path: '/api/auth/login', desc: 'Exchange credentials for a session JWT scoped to the caller’s role.' },
];

const SERVICES = [
  { icon: Server, name: 'Backend API', tech: 'Node + Express + Prisma', port: '3001', cmd: 'cd backend && npm run dev' },
  { icon: Cpu, name: 'Detection engine', tech: 'Python + FastAPI', port: '8000', cmd: 'cd python_engine && uvicorn api.app:app --port 8000' },
  { icon: ShieldCheck, name: 'Clay GPU verifier', tech: 'Python + Clay v1.5 (optional)', port: '8010', cmd: 'cd python_engine && python clay_service.py --port 8010' },
  { icon: BookOpen, name: 'Frontend', tech: 'React + Vite', port: '5173', cmd: 'cd frontend && npm run dev' },
];

const reveal = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
};

export default function Documentation() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <span className="inline-flex items-center gap-2 rounded-full border border-ocean-300 bg-ocean-50 px-4 py-1.5 text-xs font-semibold text-ocean-700">
          <BookOpen size={13} /> Documentation
        </span>
        <h1 className="mt-5 font-display text-4xl font-black tracking-tight text-slate-900">
          How the <span className="text-gradient">tracker</span> works
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-500">
          A tour of the platform: the detection pipeline, where the satellite data comes from,
          the REST API you can build on, and how to run every service locally.
        </p>
      </motion.div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[210px_1fr]">
        {/* Anchor nav */}
        <nav className="hidden lg:block">
          <div className="sticky top-24 space-y-1">
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">On this page</p>
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:bg-ocean-50 hover:text-ocean-700"
              >
                {s.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-16">
          {/* Overview */}
          <section id="overview" className="scroll-mt-24">
            <SectionTitle icon={BookOpen} eyebrow="01">Overview</SectionTitle>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              Marine Plastic Tracker turns free Sentinel-2 imagery into marine-plastic leads and 72-hour drift
              forecasts for the Indian Ocean. It is an honest decision-support pilot for agencies such as INCOIS,
              NCCR, and the Indian Coast Guard — it complements patrols, drones, and field reports, and never
              claims to replace them. Sentinel-2 revisits every ~5 days at 10 m resolution and cannot see under
              cloud or at night, so every result is a lead to verify, traceable to its source pixel and model score.
            </p>
          </section>

          {/* Pipeline */}
          <section id="pipeline" className="scroll-mt-24">
            <SectionTitle icon={Cpu} eyebrow="02">The 7-stage pipeline</SectionTitle>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {PIPELINE.map((stage, i) => (
                <motion.div key={stage.title} {...reveal} transition={{ delay: i * 0.04 }}>
                  <Card padding="md" hoverable className="h-full">
                    <div className="flex items-start gap-4">
                      <span className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ocean-600 to-ocean-400 text-white shadow-glow-primary">
                        <stage.icon size={19} />
                        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-ocean-300 bg-white font-mono text-[10px] font-bold text-ocean-700">
                          {i + 1}
                        </span>
                      </span>
                      <div>
                        <h3 className="font-display text-base font-bold text-slate-800">{stage.title}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">{stage.body}</p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Data sources */}
          <section id="sources" className="scroll-mt-24">
            <SectionTitle icon={Database} eyebrow="03">Data sources</SectionTitle>
            <div className="mt-6 space-y-3">
              {SOURCES.map((src, i) => (
                <motion.div key={src.title} {...reveal} transition={{ delay: i * 0.04 }}>
                  <Card accent={src.active} padding="md">
                    <div className="flex items-center gap-2">
                      {src.active && <CheckCircle2 size={15} className="text-success-500" />}
                      <p className="font-display text-sm font-bold text-slate-800">{src.title}</p>
                      <Badge variant={src.active ? 'success' : 'neutral'}>{src.active ? 'primary' : 'fallback'}</Badge>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{src.body}</p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>

          {/* API reference */}
          <section id="api" className="scroll-mt-24">
            <SectionTitle icon={Server} eyebrow="04">REST API reference</SectionTitle>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              All routes are served from the backend at <code className="font-mono text-ocean-700">http://localhost:3001</code>.
              Read endpoints are open in demo mode; write endpoints require a session token from{' '}
              <code className="font-mono text-ocean-700">/api/auth/login</code>.
            </p>
            <motion.div {...reveal} className="mt-5 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-ocean-50/70 text-xs uppercase tracking-wide text-ocean-800">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Method</th>
                    <th className="px-4 py-3 font-semibold">Endpoint</th>
                    <th className="hidden px-4 py-3 font-semibold sm:table-cell">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white/60">
                  {ENDPOINTS.map((e) => (
                    <tr key={e.path} className="align-top transition-colors hover:bg-ocean-50/40">
                      <td className="px-4 py-3">
                        <Badge variant={e.method === 'GET' ? 'sky' : 'purple'}>{e.method}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-800">{e.path}</td>
                      <td className="px-4 py-3 text-xs leading-relaxed text-slate-500">
                        <span className="mb-1 block font-mono text-slate-800 sm:hidden">{e.desc}</span>
                        <span className="hidden sm:inline">{e.desc}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          </section>

          {/* Getting started */}
          <section id="quickstart" className="scroll-mt-24">
            <SectionTitle icon={Terminal} eyebrow="05">Getting started</SectionTitle>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              Three services run side by side. Start them in separate terminals — the frontend proxies API
              calls to the backend, which in turn calls the Python detection engine.
            </p>
            <div className="mt-6 space-y-3">
              {SERVICES.map((svc, i) => (
                <motion.div key={svc.name} {...reveal} transition={{ delay: i * 0.05 }}>
                  <Card padding="md" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-ocean-100 text-ocean-700">
                        <svc.icon size={18} />
                      </span>
                      <div>
                        <p className="font-display text-sm font-bold text-slate-800">{svc.name}</p>
                        <p className="text-xs text-slate-500">{svc.tech}</p>
                      </div>
                    </div>
                    <div className="flex flex-1 items-center gap-3 sm:justify-end">
                      <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-slate-900/95 px-3 py-2 font-mono text-xs text-ocean-100 sm:flex-none">
                        {svc.cmd}
                      </code>
                      <Badge variant="ocean">:{svc.port}</Badge>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-400">
              No Copernicus credentials? Leave them unset and the stack boots in demo mode with sample scenes —
              perfect for a first look at{' '}
              <code className="font-mono text-ocean-600">http://localhost:5173</code>.
            </p>
          </section>

          {/* CTA */}
          <motion.div {...reveal} className="glass card-accent relative flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-slate-800">Ready to explore live detections?</h3>
              <p className="mt-1 text-sm text-slate-500">Jump into the dashboard, or reach out about a pilot deployment.</p>
            </div>
            <div className="flex flex-shrink-0 gap-3">
              <Link
                to="/app"
                className="inline-flex items-center gap-2 rounded-xl bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5"
              >
                Open dashboard <ArrowRight size={15} />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-ocean-400 hover:text-ocean-700"
              >
                Contact
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, eyebrow, children }: { icon: typeof BookOpen; eyebrow: string; children: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border pb-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ocean-100 text-ocean-700">
        <Icon size={17} />
      </span>
      <div>
        <span className="font-mono text-[11px] font-semibold text-ocean-500">{eyebrow}</span>
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">{children}</h2>
      </div>
    </div>
  );
}
