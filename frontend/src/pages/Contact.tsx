import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Mail,
  Building2,
  ShieldCheck,
  Send,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Card, Button, Badge } from '@/components';

type Role = 'Coast Guard' | 'Researcher' | 'NGO' | 'Ministry' | 'Other';

interface FormState {
  name: string;
  org: string;
  email: string;
  role: Role;
  message: string;
}

const EMPTY: FormState = { name: '', org: '', email: '', role: 'Researcher', message: '' };

const CHANNELS: { icon: ReactNode; title: string; body: string; foot: string }[] = [
  {
    icon: <Mail size={20} />,
    title: 'General email',
    body: 'Questions about the method, datasets, or the pilot itself. We reply from a shared project inbox.',
    foot: 'contact@marine-tracker.example',
  },
  {
    icon: <Building2 size={20} />,
    title: 'For agencies',
    body: 'INCOIS, NCCR, or Coast Guard teams evaluating a coastal pilot can request a scoped walkthrough and sample AOI.',
    foot: 'agencies@marine-tracker.example',
  },
  {
    icon: <ShieldCheck size={20} />,
    title: 'Data & privacy',
    body: 'This runs on open Sentinel-2 imagery at ₹0. No personal or vessel-tracking data is collected in the pilot.',
    foot: 'See our privacy page',
  },
];

export default function Contact() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [sent, setSent] = useState(false);

  const update = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="overflow-hidden">
      <section className="mx-auto max-w-5xl px-6 py-16">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-ocean-300 bg-ocean-50 px-4 py-1.5 text-xs font-semibold text-ocean-700">
            <Sparkles size={13} /> Contact &amp; request access
          </span>
          <h1 className="mt-5 font-display text-4xl font-black tracking-tight text-slate-900">
            Let&rsquo;s put satellites to <span className="text-gradient">work on plastic</span>
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-500">
            Whether you&rsquo;re a coastal agency, a researcher, or an NGO, we&rsquo;d like to hear how a
            72-hour drift forecast could fit your workflow. This is a Final Year Project pilot &mdash; a
            complement to patrols and field teams, never a replacement.
          </p>
        </motion.div>

        {/* Contact channels */}
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {CHANNELS.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
            >
              <Card hoverable className="flex h-full flex-col p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-ocean-600 to-ocean-400 text-white shadow-glow-primary">
                  {c.icon}
                </span>
                <h3 className="mt-4 font-display text-base font-bold text-slate-800">{c.title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">{c.body}</p>
                <p className="mt-3 font-mono text-xs font-semibold text-ocean-700">{c.foot}</p>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Form / confirmation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-14"
        >
          <Card accent padding="lg" className="mx-auto max-w-2xl">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900">Request access</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Tell us a little about your work and we&rsquo;ll follow up.
                </p>
              </div>
              <Badge variant="ocean" dot>
                Pilot demo
              </Badge>
            </div>

            {sent ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35 }}
                className="rounded-2xl border border-success-400/40 bg-success-100/50 p-8 text-center"
              >
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-500 text-white shadow-glow-primary">
                  <CheckCircle2 size={28} />
                </span>
                <h3 className="mt-4 font-display text-xl font-bold text-slate-900">
                  Thanks, {form.name.split(' ')[0] || 'there'}!
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
                  Your request has been noted in this demo. In the live pilot we&rsquo;d reply to{' '}
                  <span className="font-mono text-ocean-700">{form.email || 'your email'}</span> within a
                  couple of working days. No message was actually sent &mdash; this form has no backend.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => { setSent(false); setForm(EMPTY); }}>
                    Submit another
                  </Button>
                  <Link to="/app">
                    <Button size="sm" iconRight={<ArrowRight size={15} />}>
                      Explore the dashboard
                    </Button>
                  </Link>
                </div>
              </motion.div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name">
                    <input
                      required
                      value={form.name}
                      onChange={update('name')}
                      placeholder="Asha Menon"
                      className="input-glow w-full rounded-xl border border-border bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-ocean-400"
                    />
                  </Field>
                  <Field label="Organisation">
                    <input
                      required
                      value={form.org}
                      onChange={update('org')}
                      placeholder="A partner agency"
                      className="input-glow w-full rounded-xl border border-border bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-ocean-400"
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Email">
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={update('email')}
                      placeholder="you@agency.example"
                      className="input-glow w-full rounded-xl border border-border bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-ocean-400"
                    />
                  </Field>
                  <Field label="Role">
                    <select
                      value={form.role}
                      onChange={update('role')}
                      className="input-glow w-full rounded-xl border border-border bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-ocean-400"
                    >
                      <option>Coast Guard</option>
                      <option>Researcher</option>
                      <option>NGO</option>
                      <option>Ministry</option>
                      <option>Other</option>
                    </select>
                  </Field>
                </div>

                <Field label="Message">
                  <textarea
                    required
                    rows={4}
                    value={form.message}
                    onChange={update('message')}
                    placeholder="Which coastline are you interested in, and what would a good pilot outcome look like?"
                    className="input-glow w-full resize-none rounded-xl border border-border bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-ocean-400"
                  />
                </Field>

                <Button type="submit" fullWidth icon={<Send size={16} />}>
                  Send request
                </Button>
                <p className="text-center text-xs text-slate-400">
                  Demo form &mdash; submissions aren&rsquo;t stored or emailed. See our{' '}
                  <Link to="/privacy" className="text-ocean-600 hover:underline">
                    privacy note
                  </Link>
                  .
                </p>
              </form>
            )}
          </Card>
        </motion.div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
