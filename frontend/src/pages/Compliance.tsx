import { ShieldCheck, Satellite, Wind, Map as MapIcon, Lock, Scale, AlertTriangle } from 'lucide-react';
import { Card, Badge } from '@/components';

export default function Compliance() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="space-y-2 text-center">
        <Badge variant="ocean" dot>Compliance &amp; Responsible Use</Badge>
        <h1 className="font-display text-3xl font-bold text-slate-800">Data licences, security &amp; honest limits</h1>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-slate-500">
          Everything this pilot uses is free and openly licensed. This page records exactly what we use,
          under which terms, and what the system can and cannot honestly claim.
        </p>
      </header>

      {/* Data sources */}
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
              Drift forcing is a point-forecast approximation; the gridded CMEMS/ERA5 upgrade path is provisioned.
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
            <p className="font-semibold text-slate-700">Training data (planned)</p>
            <p className="text-xs text-slate-500">
              MARIDA and MADOS are published open marine-debris benchmarks; the current shipped classifier is a
              clearly-labelled synthetic-spectra baseline until that training lands.
            </p>
          </div>
        </div>
      </Card>

      {/* Security */}
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

      {/* Honest limits */}
      <Card accent className="space-y-3 border-amber-200">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-amber-700">
          <AlertTriangle size={18} /> Honest limitations
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
          <li>Sentinel-2 revisits each location roughly every <b>5 days</b> at 10 m resolution and cannot see through cloud or at night — "real-time" means real-time <i>processing</i> of the newest available scene.</li>
          <li>Coastal sediment turbidity and haze can inflate the Floating Debris Index; monsoon-season coastal detections carry elevated false-positive risk until the MARIDA-trained model lands.</li>
          <li>Drift forecasts carry an uncertainty cone by design; landfall ETAs are indicative, not navigational guidance.</li>
          <li>This is a <b>decision-support pilot</b> for INCOIS, NCCR and Indian Coast Guard workflows. It complements — and must never replace — patrols, field verification, and human judgment.</li>
        </ul>
      </Card>

      {/* Standards */}
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
    </div>
  );
}
