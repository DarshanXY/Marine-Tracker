import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronDown, HelpCircle, Mail, ArrowRight } from 'lucide-react';
import { Badge } from '@/components';

type Faq = {
  tag: 'Basics' | 'Science' | 'Limits' | 'Access' | 'Privacy';
  q: string;
  a: ReactNode;
};

const FAQS: Faq[] = [
  {
    tag: 'Basics',
    q: 'What exactly is Marine Plastic Tracker?',
    a: 'It is a Final Year Project and an honest decision-support pilot. It turns free Sentinel-2 satellite imagery into candidate marine-plastic detections and 72-hour drift forecasts for the Indian Ocean, so agencies like INCOIS, NCCR, and the Indian Coast Guard can prioritise where to look first. It runs on free tiers at effectively ₹0 running cost.',
  },
  {
    tag: 'Science',
    q: 'How accurate is satellite plastic detection?',
    a: 'Honestly: it finds candidates, not certainties. Sentinel-2 cannot resolve individual bottles from orbit — it detects the aggregate optical signature of floating material via the Floating Debris Index, then a 3-seed MLP ensemble scores each patch and a Clay foundation model gives a second opinion. Sun-glint, sea-foam, turbid river plumes, and algal blooms can all mimic plastic, so on held-out data plastic detection sits near ~0.8 F1. That is why we surface a calibrated HIGH-confidence tier (~90% precision) for human validation, rather than reporting anything as a confirmed fact.',
  },
  {
    tag: 'Limits',
    q: 'What are the real limitations I should know about?',
    a: (
      <>
        Three big ones, and we do not hide them:
        <ul className="mt-2 space-y-1.5 pl-1">
          <li className="flex gap-2"><span className="text-ocean-500">•</span><span><strong className="text-slate-700">Cloud cover</strong> — optical sensors cannot see through clouds, common during the monsoon over the Indian Ocean.</span></li>
          <li className="flex gap-2"><span className="text-ocean-500">•</span><span><strong className="text-slate-700">~5-day revisit</strong> — a given patch of sea is only imaged every few days, so fast-moving debris can be missed between passes.</span></li>
          <li className="flex gap-2"><span className="text-ocean-500">•</span><span><strong className="text-slate-700">10 m resolution</strong> — one pixel is 10×10 m, so only sizeable accumulations (windrows, slicks) are detectable, not stray items.</span></li>
        </ul>
      </>
    ),
  },
  {
    tag: 'Limits',
    q: 'Does this replace patrols or field teams?',
    a: 'No — and it never claims to. It is a complement, not a replacement. The system narrows millions of pixels down to a short list of leads so crews spend fuel and time where the odds are best. Confirmation, cleanup, and enforcement still depend entirely on patrols, drones, and field reports.',
  },
  {
    tag: 'Science',
    q: 'What satellites and data does it use?',
    a: 'Primarily Copernicus Sentinel-2 (L2A surface reflectance), accessed free via the Copernicus Data Space and the Element84 Earth Search public STAC on AWS Open Data. No paid imagery is used. The detection index relies on the near-infrared and red-edge bands, which respond to material floating on the water surface.',
  },
  {
    tag: 'Science',
    q: 'How are hotspots defined?',
    a: 'Individual detections are grouped with DBSCAN, a density-based clustering algorithm. It merges nearby candidate pixels into a single hotspot when enough of them fall within a set distance, and leaves isolated one-off pixels as unclustered noise. This turns scattered detections into a handful of actionable zones with a rough area and confidence.',
  },
  {
    tag: 'Science',
    q: 'What is the 72-hour drift forecast?',
    a: 'Confirmed plastic is advected forward for 72 hours using a Lagrangian model driven by real ocean-current and wind data, with a windage factor of roughly 1.5–3%. Because currents and wind are uncertain, the output is an ensemble uncertainty cone — a range of likely positions — rather than a single confident track.',
  },
  {
    tag: 'Science',
    q: 'What is the Clay verifier, and why a second model?',
    a: 'After the MLP flags a plastic hotspot, a frozen Clay v1.5 foundation model re-embeds that patch and marks it CONFIRMED or POSSIBLE. It is a precision gate — a diverse second opinion that pushes plastic precision toward ~0.92 and filters false positives like turbid water — not a standalone detector. If Clay is offline the pilot still runs MLP-only, and says so.',
  },
  {
    tag: 'Science',
    q: 'Does the model get better over time?',
    a: 'That is the intent. Analysts label real detections in an active-learning queue, and those labels feed back into retraining. The public numbers here are the current honest held-out scores, not a promise — but the pipeline is built so that more validated labels sharpen it, especially on the hard, look-alike cases.',
  },
  {
    tag: 'Access',
    q: 'Is it genuinely free?',
    a: 'Yes. The satellite data is open, and the stack (PostGIS, Node, FastAPI, React, Redis) is deployed on free hosting and free API tiers. The goal is to prove that useful marine-plastic intelligence is achievable at zero running cost — an important point for public agencies with tight budgets.',
  },
  {
    tag: 'Access',
    q: 'Can I get API access?',
    a: (
      <>
        This is a pilot, so there is no public production API yet. For a research collaboration or an
        evaluation with a partner agency, reach out via the{' '}
        <Link to="/contact" className="font-semibold text-ocean-600 underline-offset-2 hover:underline">contact page</Link>{' '}
        and see the{' '}
        <Link to="/docs" className="font-semibold text-ocean-600 underline-offset-2 hover:underline">documentation</Link>{' '}
        for how the pipeline is structured.
      </>
    ),
  },
  {
    tag: 'Privacy',
    q: 'Is my data private?',
    a: (
      <>
        The imagery is public satellite data — it contains no personal information. Any account details you
        provide are used only to operate the pilot and are never sold. Full details live in our{' '}
        <Link to="/privacy" className="font-semibold text-ocean-600 underline-offset-2 hover:underline">privacy policy</Link>.
      </>
    ),
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="overflow-hidden">
      <section className="mx-auto max-w-3xl px-6 py-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-ocean-300 bg-ocean-50 px-4 py-1.5 text-xs font-semibold text-ocean-700">
            <HelpCircle size={14} /> Frequently asked questions
          </span>
          <h1 className="mt-5 font-display text-4xl font-black tracking-tight text-slate-900">
            Honest answers about <span className="text-gradient">what this can do</span>
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-500">
            No hype and no fake numbers — just plain explanations of how the pilot works, where it helps,
            and exactly where satellites fall short.
          </p>
        </motion.div>

        <div className="mt-10 space-y-3">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <motion.div
                key={item.q}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i * 0.04, 0.2) }}
                className={`glass relative overflow-hidden rounded-2xl border transition-colors ${isOpen ? 'border-ocean-300' : 'border-border'}`}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left"
                >
                  <Badge variant="ocean">{item.tag}</Badge>
                  <span className="flex-1 font-display text-base font-bold text-slate-800">{item.q}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.25 }}
                    className={`flex-shrink-0 ${isOpen ? 'text-ocean-600' : 'text-slate-400'}`}
                  >
                    <ChevronDown size={20} />
                  </motion.span>
                </button>
                <motion.div
                  initial={false}
                  animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 pt-0 text-sm leading-relaxed text-slate-500">
                    <div className="border-t border-border/70 pt-4">{item.a}</div>
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass card-accent relative mt-12 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h3 className="font-display text-lg font-bold text-slate-800">Still have a question?</h3>
            <p className="mt-1 text-sm text-slate-500">
              Reach out about a collaboration, an evaluation, or anything the FAQ missed.
            </p>
          </div>
          <Link
            to="/contact"
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-ocean-600 px-5 py-3 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5"
          >
            <Mail size={16} /> Contact us <ArrowRight size={16} />
          </Link>
        </motion.div>
      </section>
    </div>
  );
}
