import { motion } from 'framer-motion';
import { ShieldCheck, Satellite, Wind, Map as MapIcon, Lock, Scale, AlertTriangle } from 'lucide-react';
import { Card, Badge } from '@/components';
import { reveal } from '@/lib/motion';

export default function Compliance() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <motion.header {...reveal()} className="space-y-2 text-center">
        <Badge variant="ocean" dot>Compliance &amp; Responsible Use</Badge>
        <h1 className="font-display text-3xl font-bold text-slate-800">Data licences, security &amp; honest limits</h1>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-slate-500">
          Everything this pilot uses is free and openly licensed. This page records exactly what we use,
          under which terms, and what the system can and cannot honestly claim.
        </p>
      </motion.header>

      {/* Data sources */}
      <motion.div {...reveal(0.04)}>
        <Card accent className="space-y-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-800">
            <Satellite size={18} className="text-ocean-600" /> Data sources &amp; licences
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-slate-600">
            <div>
              <p className="font-semibold text-slate-700">Copernicus Sentinel-2 imagery (ESA)</p>
              <p className="text-xs text-slate-500">
                Used under the <b>free, full and open</b> Copernicus data policy. Scene discovery via Element84
                Earth Search on the AWS Open Data Program; pixel reflectance via the Copernicus Data Space
                Ecosystem Sentinel Hub APIs (free tier). Attribution: "Contains modified Copernicus Sentinel data".
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">Ocean currents &amp; winds — Open-Meteo</p>
              <p className="text-xs text-slate-500">
                Marine and weather forecast APIs, free for non-commercial use, CC-BY 4.0 attribution.
                Drift runs on real Open-Meteo currents + winds; the output is an uncertainty cone, and a
                gridded CMEMS/ERA5 forcing path is provisioned.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">Basemap — Esri World Imagery</p>
              <p className="text-xs text-slate-500">
                Displayed with attribution (Esri, Maxar, Earthstar Geographics) under Esri's free basemap terms.
                OpenStreetMap contributors for the street layer.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">Training data — MARIDA + MADOS (open benchmarks)</p>
              <p className="text-xs text-slate-500">
                The shipped classifier is a 3-seed per-pixel MLP ensemble trained on the published MARIDA and
                MADOS marine-debris benchmarks (Kikaki et al.), with a frozen Clay v1.5 foundation model as a
                second-stage verifier. Held-out macro-F1 is ~0.82; we publish the real per-class numbers
                (including where plastic detection is weak) rather than a hero accuracy.
              </p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Security */}
      <motion.div {...reveal(0.04)}>
        <Card accent className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-800">
            <Lock size={18} className="text-ocean-600" /> Security &amp; privacy
          </h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
            <li>Authentication: JWT access tokens (15 min) with one-time rotating refresh tokens (7 days); passwords hashed with bcrypt (12 rounds); optional TOTP two-factor for privileged roles.</li>
            <li>Authorization: seven-level RBAC enforced server-side on every privileged route — the UI hiding a page is never the only guard.</li>
            <li>The platform stores no personal data beyond account credentials (username, email, role). No tracking, no third-party analytics.</li>
            <li>API keys and secrets live in server-side environment configuration, never in the client bundle.</li>
          </ul>
        </Card>
      </motion.div>

      {/* Honest limits */}
      <motion.div {...reveal(0.04)}>
        <Card accent className="space-y-3 border-amber-200">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-amber-700">
            <AlertTriangle size={18} /> Honest limitations
          </h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
            <li>Sentinel-2 revisits each location roughly every <b>5 days</b> at 10 m resolution and cannot see through cloud or at night — "real-time" means real-time <i>processing</i> of the newest available scene.</li>
            <li>Coastal sediment turbidity and haze can inflate the Floating Debris Index. Ingest is cloud-aware (least-cloud compositing + SCL masking) and every scan is reliability-graded, but monsoon-season coastal detections still carry elevated false-positive risk — which is why only the HIGH-confidence tier drives dispatch.</li>
            <li>Plastic detection is bounded by 10 m resolution: sub-pixel or diffuse plastic is spectrally invisible, so recall on real in-situ targets is genuinely limited. We report this openly rather than inflate it.</li>
            <li>Drift forecasts carry an uncertainty cone by design; landfall ETAs are indicative, not navigational guidance.</li>
            <li>This is a <b>decision-support pilot</b> for INCOIS, NCCR and Indian Coast Guard workflows. It complements — and must never replace — patrols, field verification, and human judgment.</li>
          </ul>
        </Card>
      </motion.div>

      {/* Standards */}
      <motion.div {...reveal(0.04)}>
        <Card accent className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-800">
            <Scale size={18} className="text-ocean-600" /> Standards &amp; interoperability
          </h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
            <li>Exports use open formats: CSV, GeoJSON (RFC 7946) and JSON — no vendor lock-in.</li>
            <li>Scene metadata follows the STAC specification; the scientific pipeline (FDI, DBSCAN parameters, windage range) is documented and reproducible.</li>
            <li>All third-party services degrade gracefully: the platform remains functional offline on clearly-labelled demo data.</li>
          </ul>
          <p className="flex items-center gap-2 pt-1 text-xs text-slate-400">
            <ShieldCheck size={14} className="text-success-600" /> Marine Plastic Tracker · Final Year Project pilot · ₹0 infrastructure
            <MapIcon size={12} className="ml-auto" /> <Wind size={12} />
          </p>
        </Card>
      </motion.div>
    </div>
  );
}
