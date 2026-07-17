import { lazy, Suspense, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, LineChart, Download } from 'lucide-react';
import { PageHeader, Badge, Tabs, SkeletonCard, type TabItem } from '@/components';

// Reuse the full analytics surface and the export/report builder, headerless.
const Analytics = lazy(() => import('@/pages/Analytics'));
const Reports = lazy(() => import('@/pages/Reports'));

type TabKey = 'analyze' | 'export';

/**
 * Analytics & Reports — one analyze-then-ship surface (IA v2 merge of Analytics
 * + Reports). Reports only ever re-exported Analytics' own numbers, so they now
 * live together: study the trends, then export exactly what you saw.
 */
export default function AnalyticsReports() {
  const [tab, setTab] = useState<TabKey>('analyze');

  const items: TabItem[] = [
    { key: 'analyze', label: 'Analyze', icon: <LineChart size={15} /> },
    { key: 'export', label: 'Export & Report', icon: <Download size={15} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Reports"
        subtitle="Study the trends, classification mix, and regional breakdown — then ship exactly what you analysed."
        badge={<Badge variant="ocean" dot><BarChart3 size={11} className="mr-0.5 inline" />live eval</Badge>}
      />

      <Tabs items={items} activeKey={tab} onChange={(k) => setTab(k as TabKey)} variant="pill" />

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <Suspense fallback={<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>}>
            {tab === 'analyze' ? <Analytics embedded /> : <Reports embedded />}
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
