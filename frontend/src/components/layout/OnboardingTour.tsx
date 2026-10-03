/**
 * First-login onboarding tour — a four-step walkthrough of the app shown once
 * (dismissal persists in localStorage). Deliberately a centered step-through,
 * not an element-anchored spotlight: it works on every viewport, needs no
 * third-party dep, and never breaks when the layout changes.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Map as MapIcon, Activity, FileText, Waves, ArrowRight, X } from 'lucide-react';

const DONE_KEY = 'mpt-tour-v1';

const STEPS = [
  {
    icon: Waves,
    title: 'Welcome to Marine Plastic Tracker',
    body: 'Free Sentinel-2 satellite imagery → plastic detections → 72-hour drift forecasts for the Indian Ocean. Everything you see is computed by a real pipeline — this tour shows you where to look.',
    cta: null,
  },
  {
    icon: MapIcon,
    title: 'Draw anywhere on the Map Explorer',
    body: 'Drag a box over any stretch of ocean and the full pipeline — scene scan, FDI, CNN prediction, clustering, drift — runs live for that exact area, pinned to the newest real Sentinel-2 scene.',
    cta: { to: '/app/map', label: 'Open the map' },
  },
  {
    icon: Activity,
    title: 'Command Center is mission control',
    body: 'System health, a live situation-level gauge, the alert inbox, coast-bound hotspots sorted by landfall ETA, the verification queue, and a live WebSocket event feed — one screen for the duty officer.',
    cta: { to: '/app', label: 'Open Command Center' },
  },
  {
    icon: FileText,
    title: 'Take the data with you',
    body: 'Analytics & Reports exports CSV, GIS-ready GeoJSON, and a printable situation report. And remember: this is a decision-support pilot — it complements patrols, never replaces them.',
    cta: { to: '/app/analytics', label: 'View analytics & reports' },
  },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(() => !localStorage.getItem(DONE_KEY));
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const finish = () => {
    localStorage.setItem(DONE_KEY, new Date().toISOString());
    setOpen(false);
  };

  const goto = (to: string) => {
    finish();
    navigate(to);
  };

  const s = STEPS[step];
  const Icon = s.icon;
  const last = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-border/70 bg-white p-6 shadow-glass"
            role="dialog"
            aria-label="Onboarding tour"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ocean-50 text-ocean-600">
                <Icon size={20} />
              </span>
              <button type="button" onClick={finish} aria-label="Skip tour" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <h3 className="mt-3 font-display text-lg font-bold text-slate-800">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{s.body}</p>

            <div className="mt-5 flex items-center justify-between">
              <div className="flex gap-1.5">
                {STEPS.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-ocean-600' : 'w-1.5 bg-slate-200'}`} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {s.cta && (
                  <button
                    type="button"
                    onClick={() => goto(s.cta!.to)}
                    className="rounded-xl border border-ocean-200 px-3 py-1.5 text-xs font-semibold text-ocean-700 hover:bg-ocean-50"
                  >
                    {s.cta.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (last ? finish() : setStep(step + 1))}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-ocean-600 px-4 py-1.5 text-xs font-semibold text-white shadow-glow-primary"
                >
                  {last ? 'Start exploring' : 'Next'} <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
