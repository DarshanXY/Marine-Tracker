import { Link } from 'react-router-dom';
import { Github, Satellite, ShieldCheck } from 'lucide-react';
import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="relative mt-auto border-t border-border/70 bg-white/60 backdrop-blur">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-500">
              Turning free Sentinel-2 satellite data into marine-plastic detection and
              72-hour drift forecasts for the Indian Ocean. An honest pilot to support —
              <span className="font-medium text-slate-600"> not replace</span> — patrols and
              field teams.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ocean-50 px-3 py-1 text-xs font-medium text-ocean-700">
                <Satellite size={12} /> Sentinel-2
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-100 px-3 py-1 text-xs font-medium text-success-700">
                <ShieldCheck size={12} /> Runs at ₹0 on free tiers
              </span>
            </div>
          </div>

          <div>
            <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-400">Platform</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              <li><Link to="/app" className="hover:text-ocean-600">Command Center</Link></li>
              <li><Link to="/app/map" className="hover:text-ocean-600">Map Explorer</Link></li>
              <li><Link to="/app/records" className="hover:text-ocean-600">Records</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-400">Resources</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              <li><Link to="/about" className="hover:text-ocean-600">About &amp; Method</Link></li>
              <li><Link to="/docs" className="hover:text-ocean-600">Documentation</Link></li>
              <li><Link to="/faq" className="hover:text-ocean-600">FAQ</Link></li>
              <li><Link to="/contact" className="hover:text-ocean-600">Contact</Link></li>
              <li>
                <a href="https://dataspace.copernicus.eu" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-ocean-600">
                  <Github size={13} /> Data source
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 text-xs text-slate-400 sm:flex-row">
          <p>© {new Date().getFullYear()} Marine Plastic Tracker. Final Year Project.</p>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="hover:text-ocean-600">Terms</Link>
            <Link to="/privacy" className="hover:text-ocean-600">Privacy</Link>
            <span className="font-mono">INCOIS · NCCR · ICG</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
