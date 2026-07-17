import { lazy, Suspense, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlaskConical, Gauge, Sparkles, CheckCircle2, Layers, Boxes } from 'lucide-react';
import { PageHeader, Badge, Tabs, StatCard, SkeletonCard, InfoTip, type TabItem } from '@/components';
import { usePipelineStatus, useSimilarityInfo } from '@/hooks/useApi';

// Reuse the full Model-Health report card and the Clay similarity explorer, headerless.
const ModelHealth = lazy(() => import('@/pages/ModelHealth'));
const Intelligence = lazy(() => import('@/pages/Intelligence'));

type TabKey = 'classifier' | 'embeddings';

/**
 * AI Lab — the flagship ML showcase (IA v2 merge of Model Health + Similarity &
 * Fusion). A model report-card banner up top, then a Classifier tab and an
 * Embeddings & Fusion tab — the MLP + Clay fusion story told once, in one place.
 */
export default function AILab() {
  const [tab, setTab] = useState<TabKey>('classifier');
  const status = usePipelineStatus();
  const sim = useSimilarityInfo();

  const model = status.data?.model;
  const metrics = model?.metrics;
  const acc = metrics?.testAccuracy;
  const f1 = metrics?.macroF1;
  const classes = model?.classes?.length ?? 4;
  const refSites = sim.data?.size ?? 0;

  const items: TabItem[] = [
    { key: 'classifier', label: 'Classifier', icon: <Gauge size={15} />, badge: acc != null ? `${Math.round(acc * 100)}%` : undefined },
    { key: 'embeddings', label: 'Visual fingerprints', icon: <Sparkles size={15} />, badge: refSites ? refSites.toLocaleString() : undefined },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Lab"
        subtitle="The model's report card and its visual fingerprints in one place — how accurate it is, and how two AI models vote together to make a call: when they agree it's ‘confirmed’, when only one flags it it's ‘possible’ (MLP + Clay fusion)."
        badge={
          <Badge variant={model?.loaded ? 'success' : 'warn'} dot>
            <FlaskConical size={11} className="mr-0.5 inline" />
            {model?.loaded ? (model.mode ?? 'model loaded') : 'heuristic'}
          </Badge>
        }
      />

      {/* Report-card banner — lead with the honest balanced score, not the
          Water-inflated accuracy. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Balanced score" value={f1 != null ? f1.toFixed(2) : '—'} icon={<CheckCircle2 size={18} />} color="success" delay={0} />
        <StatCard label="Accuracy (unseen data)" value={acc != null ? Math.round(acc * 100) : 0} unit="%" icon={<Gauge size={18} />} color="ocean" delay={0.05} />
        <StatCard label="Classes" value={classes} icon={<Layers size={18} />} color="purple" delay={0.1} />
        <StatCard label="Reference sites" value={refSites} icon={<Boxes size={18} />} color="ocean" delay={0.15} />
      </div>

      {/* Plain-language guide to the four numbers above */}
      <p className="text-xs text-slate-400 -mt-2">
        What these mean: the{' '}
        <InfoTip term="Balanced score (macro-F1)">Averages accuracy across all four classes so rare classes (like plastic) count as much as common ones (0–1, higher is better). This is the honest headline number.</InfoTip>{' '}
        is the fair overall grade;{' '}
        <InfoTip term="Accuracy (held-out)">Accuracy on unseen test data the model never trained on. It looks very high mainly because ~97% of pixels are ordinary water, which is easy — so read the balanced score first.</InfoTip>{' '}accuracy
        looks high because most pixels are easy open water; the number of material{' '}
        <InfoTip term="Classes">The categories the model sorts each detection into: plastic, seaweed, foam or water.</InfoTip>{' '}it sorts into; and the{' '}
        <InfoTip term="Reference sites (Clay)">Known locations the AI keeps a visual fingerprint (Clay) of, so it can compare new scenes against places it has seen before.</InfoTip>{' '}it compares against.
      </p>

      <Tabs items={items} activeKey={tab} onChange={(k) => setTab(k as TabKey)} variant="pill" />

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <Suspense fallback={<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>}>
            {tab === 'classifier' ? <ModelHealth embedded /> : <Intelligence embedded />}
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
