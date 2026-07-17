import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  UserCircle,
  Workflow,
  EyeOff,
  FlaskConical,
  Clock,
  Lock,
  KeyRound,
  Mail,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Card, Badge } from '@/components';

type Section = {
  icon: typeof ShieldCheck;
  title: string;
  body: ReactNode;
  points?: string[];
};

const SECTIONS: Section[] = [
  {
    icon: UserCircle,
    title: 'What we collect',
    body: 'The bare minimum needed to run a secure sign-in. Nothing more, and nothing sold.',
    points: [
      'A username and email address, so we can identify your account and let you log back in.',
      'A password — stored only as a one-way hash, never in readable form (see Security below).',
      'Basic session data (a signed token) that keeps you logged in while you use the app.',
      'Optional 2FA settings, if you choose to turn them on.',
    ],
  },
  {
    icon: Workflow,
    title: 'How we use it',
    body: 'Your data powers the product experience — it is never used for advertising or resale.',
    points: [
      'Authenticating you and keeping your session secure.',
      'Applying your role permissions (viewer, analyst, or agency lead) across the dashboard.',
      'Sending essential account emails, such as a password reset you request.',
      'That is the full list. We do not build advertising or behavioural profiles.',
    ],
  },
  {
    icon: EyeOff,
    title: 'What we never do',
    body: 'This is a Final Year Project pilot, not an ad business. There is nothing to monetise here.',
    points: [
      'No third-party trackers, analytics pixels, or advertising SDKs.',
      'No selling, renting, or sharing of your data with brokers.',
      'No cross-site fingerprinting or hidden background collection.',
    ],
  },
  {
    icon: FlaskConical,
    title: 'Demo mode',
    body: (
      <>
        You can explore the dashboard in <span className="font-semibold text-slate-700">demo mode</span>{' '}
        without creating an account. Demo mode reads pre-computed sample detections and stores nothing
        server-side beyond your temporary browser session — close the tab and it is gone.
      </>
    ),
  },
  {
    icon: Clock,
    title: 'Retention',
    body: 'We keep account data only for as long as your account exists.',
    points: [
      'Delete your account and we erase the associated username, email, and password hash.',
      'Session tokens expire automatically and are not retained afterwards.',
      'Demo sessions leave no lasting record on our servers.',
    ],
  },
  {
    icon: Lock,
    title: 'Security',
    body: 'Sensible, well-established protections — no exotic promises we cannot keep.',
    points: [
      'Passwords are hashed with bcrypt; we can never read your original password.',
      'Sessions use signed JWTs transmitted over encrypted (HTTPS) connections.',
      'Optional two-factor authentication (2FA) adds a second layer at sign-in.',
    ],
  },
];

const RIGHTS = [
  {
    icon: KeyRound,
    title: 'Access',
    body: 'Ask what we hold about your account, and we will tell you in plain language.',
  },
  {
    icon: ShieldCheck,
    title: 'Correct',
    body: 'Update your username, email, or security settings at any time from Settings.',
  },
  {
    icon: EyeOff,
    title: 'Delete',
    body: 'Request full deletion of your account and we remove your personal data.',
  },
];

export default function Privacy() {
  return (
    <div className="overflow-hidden">
      <section className="mx-auto max-w-4xl px-6 py-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-ocean-300 bg-ocean-50 px-4 py-1.5 text-xs font-semibold text-ocean-700">
            <ShieldCheck size={14} /> Privacy Policy
          </span>
          <h1 className="mt-5 font-display text-4xl font-black tracking-tight text-slate-900">
            Your data, kept <span className="text-gradient">honest and minimal</span>
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-500">
            Marine Plastic Tracker is a zero-cost decision-support pilot. We collect only what a
            secure sign-in genuinely needs, we never track you across the web, and we never sell anything.
            This page explains exactly what happens to your information — in plain words.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <Badge variant="ocean" dot>Last updated 2 July 2026</Badge>
            <span>Applies to the web app and demo mode.</span>
          </div>
        </motion.div>

        {/* Quick reassurance */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="glass card-accent relative mt-10 p-6"
        >
          <h2 className="font-display text-base font-bold text-slate-800">The short version</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              'Only your username, email, and a hashed password.',
              'No third-party tracking, no ads, no data brokers.',
              'Demo mode stores nothing server-side beyond your session.',
              'Delete your account and your personal data goes with it.',
            ].map((line) => (
              <div key={line} className="flex items-start gap-2.5">
                <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0 text-success-500" />
                <p className="text-sm leading-relaxed text-slate-600">{line}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Detailed sections */}
        <div className="mt-12 space-y-6">
          {SECTIONS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
            >
              <Card padding="lg" className="flex gap-5">
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ocean-600 to-ocean-400 text-white shadow-glow-primary">
                  <s.icon size={22} />
                </span>
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-800">{s.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{s.body}</p>
                  {s.points && (
                    <ul className="mt-3 space-y-2">
                      {s.points.map((p) => (
                        <li key={p} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600">
                          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ocean-400" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Your rights */}
        <motion.h2
          initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="mt-14 font-display text-2xl font-black tracking-tight text-slate-900"
        >
          Your rights
        </motion.h2>
        <p className="mt-2 text-sm text-slate-500">You stay in control. Reach out any time to exercise these.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {RIGHTS.map((r, i) => (
            <motion.div
              key={r.title}
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <Card hoverable padding="md" className="h-full">
                <r.icon size={20} className="text-ocean-600" />
                <h3 className="mt-3 font-display text-base font-bold text-slate-800">{r.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{r.body}</p>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Contact */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="glass relative mt-12 flex flex-col gap-4 p-7 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex gap-4">
            <Mail className="mt-0.5 flex-shrink-0 text-ocean-600" size={22} />
            <div>
              <h3 className="font-display text-base font-bold text-slate-800">Questions about your privacy?</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                Email us at{' '}
                <a href="mailto:contact@marine-tracker.example" className="font-medium text-ocean-700 underline decoration-ocean-300 underline-offset-2">
                  contact@marine-tracker.example
                </a>{' '}
                and we will respond within a few working days.
              </p>
            </div>
          </div>
          <Link
            to="/contact"
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-ocean-600 px-5 py-3 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5"
          >
            Contact us <ArrowRight size={16} />
          </Link>
        </motion.div>

        <p className="mt-8 text-center text-xs leading-relaxed text-slate-400">
          This pilot is operated by a student team for research and demonstration. As the project evolves we
          may refine this policy; material changes will be noted here. See also our{' '}
          <Link to="/terms" className="text-ocean-600 underline underline-offset-2">Terms</Link>.
        </p>
      </section>
    </div>
  );
}
