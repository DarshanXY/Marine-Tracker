import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldAlert, Mail, ArrowRight, FileCheck } from 'lucide-react';
import { Card } from '@/components';

type Section = {
  id: string;
  n: string;
  title: string;
  lead: string;
  points?: string[];
};

const SECTIONS: Section[] = [
  {
    id: 'acceptance',
    n: '01',
    title: 'Acceptance',
    lead:
      'By accessing or using Marine Plastic Tracker — the website, dashboard, maps, forecasts, and any related APIs (collectively, the "service") — you agree to these Terms of Use. If you do not agree, please do not use the service. This is a Final Year Project pilot offered for evaluation and research; it is not a commercial product.',
  },
  {
    id: 'nature',
    n: '02',
    title: 'Nature of the service',
    lead:
      'Marine Plastic Tracker is a decision-support pilot. It turns free Sentinel-2 satellite imagery into candidate marine-plastic detections and 72-hour drift forecasts to help prioritise attention. It is intended to complement — never to replace — official patrols, field teams, drones, buoys, or navigational systems.',
    points: [
      'Sentinel-2 revisits roughly every five days at 10 m resolution and cannot see through clouds or at night, so coverage has real gaps.',
      'Detections are candidates. Only human-validated results are marked "confirmed", and even those carry uncertainty.',
      'Drift forecasts are probabilistic uncertainty cones based on modelled currents and windage — not guarantees of where debris will be.',
    ],
  },
  {
    id: 'no-warranty',
    n: '03',
    title: 'No warranty',
    lead:
      'The service is provided "as is" and "as available", without warranties of any kind, whether express or implied — including, without limitation, accuracy, completeness, reliability, timeliness, or fitness for a particular purpose. Outputs are estimates derived from remote-sensing data and machine-learning models and may contain errors, omissions, false positives, or false negatives.',
  },
  {
    id: 'acceptable-use',
    n: '04',
    title: 'Acceptable use',
    lead: 'You agree to use the service responsibly. In particular, you will not:',
    points: [
      'Rely on it as the sole basis for any decision affecting safety of life, navigation, search-and-rescue, or emergency response.',
      'Present its outputs as official, validated, or authoritative findings of any government or partner agency.',
      'Attempt to overload, scrape at scale, disrupt, or gain unauthorised access to the service or its infrastructure.',
      'Use the service unlawfully, or in violation of the licences governing the underlying satellite and ocean data.',
    ],
  },
  {
    id: 'data-accounts',
    n: '05',
    title: 'Data & accounts',
    lead:
      'Some features require an account. You are responsible for keeping your credentials secure and for activity under your account. Access to certain views is scoped by role. We may suspend or remove accounts to protect the pilot or its users.',
    points: [
      'Underlying imagery comes from open sources such as the Copernicus Data Space and public AWS Open Data, and remains subject to their respective licences.',
      'You are responsible for independently verifying any result — through patrols, field observation, or authoritative sources — before acting on it.',
      'As a pilot, data may be reset, re-processed, or removed without notice, and no data-retention guarantees are offered.',
    ],
  },
  {
    id: 'liability',
    n: '06',
    title: 'Limitation of liability',
    lead:
      'To the maximum extent permitted by applicable law, the project team and its contributors shall not be liable for any direct, indirect, incidental, consequential, or special damages arising from your use of, or reliance on, the service or its outputs. There is no service-level agreement, uptime commitment, or support obligation for this pilot.',
  },
  {
    id: 'changes',
    n: '07',
    title: 'Changes',
    lead:
      'We may update these terms, or modify, suspend, or discontinue any part of the service, at any time as the pilot evolves. Material changes will be reflected by updating the notice below. Your continued use after an update constitutes acceptance of the revised terms.',
  },
];

export default function Terms() {
  return (
    <div className="overflow-hidden">
      <section className="mx-auto max-w-4xl px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-ocean-300 bg-ocean-50 px-4 py-1.5 text-xs font-semibold text-ocean-700">
            <FileCheck size={13} /> Terms of Use
          </span>
          <h1 className="mt-5 font-display text-4xl font-black tracking-tight text-slate-900">
            The <span className="text-gradient">honest</span> fine print
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-500">
            Marine Plastic Tracker is a research pilot for decision support. These terms
            spell out what it does, what it does not promise, and how it should — and should not —
            be used.
          </p>
          <p className="mt-3 font-mono text-xs text-slate-400">Last updated: this pilot release</p>
        </motion.div>

        {/* Prominent disclaimer callout */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Card accent padding="lg" className="mt-10 flex gap-4">
            <ShieldAlert className="mt-0.5 flex-shrink-0 text-amber-500" size={22} />
            <div>
              <h3 className="font-display text-base font-bold text-slate-800">
                Decision-support only — not a substitute for patrols or navigation
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                Everything here is provided to help agencies prioritise effort. It does not replace
                official patrols, field verification, or navigational systems, and no output should be
                treated as certain. You remain responsible for independently verifying any detection
                or forecast before you act on it.
              </p>
            </div>
          </Card>
        </motion.div>

        {/* Section quick-links */}
        <motion.nav
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-8 flex flex-wrap gap-2"
          aria-label="Sections"
        >
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-border bg-white/70 px-3 py-1 text-xs font-medium text-slate-500 transition-colors hover:border-ocean-300 hover:text-ocean-700"
            >
              {s.title}
            </a>
          ))}
        </motion.nav>

        {/* Prose sections */}
        <div className="mt-6 space-y-5">
          {SECTIONS.map((s, i) => (
            <motion.section
              key={s.id}
              id={s.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: (i % 3) * 0.04 }}
              className="scroll-mt-24"
            >
              <Card padding="lg">
                <h2 className="flex items-baseline gap-3 font-display text-xl font-bold text-slate-900">
                  <span className="font-mono text-sm font-semibold text-ocean-500">{s.n}</span>
                  {s.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{s.lead}</p>
                {s.points && (
                  <ul className="mt-4 space-y-2.5">
                    {s.points.map((p) => (
                      <li key={p} className="flex gap-3 text-sm leading-relaxed text-slate-600">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ocean-400" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </motion.section>
          ))}
        </div>

        {/* Contact */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          id="contact"
          className="scroll-mt-24"
        >
          <Card accent padding="lg" className="mt-5">
            <h2 className="flex items-baseline gap-3 font-display text-xl font-bold text-slate-900">
              <span className="font-mono text-sm font-semibold text-ocean-500">08</span>
              Contact
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Questions about these terms, or interested in evaluating the pilot with a partner
              agency? We would like to hear from you.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 rounded-xl bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5"
              >
                Get in touch <ArrowRight size={16} />
              </Link>
              <a
                href="mailto:contact@marine-tracker.example"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-ocean-300 hover:text-ocean-700"
              >
                <Mail size={16} /> contact@marine-tracker.example
              </a>
            </div>
          </Card>
        </motion.div>

        <p className="mt-10 text-center text-xs leading-relaxed text-slate-400">
          See also our{' '}
          <Link to="/privacy" className="font-medium text-ocean-600 hover:underline">
            Privacy notice
          </Link>{' '}
          and the{' '}
          <Link to="/about" className="font-medium text-ocean-600 hover:underline">
            method &amp; limitations
          </Link>{' '}
          behind every number.
        </p>
      </section>
    </div>
  );
}
