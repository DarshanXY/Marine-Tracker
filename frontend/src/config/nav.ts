/**
 * Single source of truth for in-app navigation — consumed by the sidebar
 * (AppLayout) and the command palette so they never drift apart.
 *
 * IA v2 (consolidated 14 → 10): overlapping monitoring/model/export pages were
 * merged into distinct destinations. Retired routes (/app/ops, /app/alerts,
 * /app/detections, /app/hotspots, /app/model, /app/intelligence, /app/reports)
 * permanently redirect — see App.tsx — so old bookmarks never 404.
 */
import {
  Radar, Map as MapIcon, Layers, Cpu, Ship, FlaskConical, BookMarked,
  BarChart3, Settings as SettingsIcon, ShieldCheck, GraduationCap,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: typeof Radar;
  end?: boolean;
  adminOnly?: boolean;
  keywords?: string;
};
export type NavSection = { title: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Monitor',
    items: [
      { to: '/app', label: 'Command Center', icon: Radar, end: true, keywords: 'home overview live ops alerts inbox feed dashboard situation fleet run all regions' },
      { to: '/app/map', label: 'Map Explorer', icon: MapIcon, keywords: 'aoi scan draw area map drift heatmap' },
      { to: '/app/areas', label: 'Areas', icon: BookMarked, keywords: 'saved aoi study area bookmark watchlist trajectory forecast drift 72h prediction landfall rescan' },
      { to: '/app/records', label: 'Records', icon: Layers, keywords: 'detections hotspots clusters catalog table candidates fdi dbscan severity' },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { to: '/app/ai-lab', label: 'AI Lab', icon: FlaskConical, keywords: 'model accuracy confusion matrix similarity clay embeddings fusion change capabilities evaluate metrics' },
      { to: '/app/active-learning', label: 'Active Learning', icon: GraduationCap, keywords: 'label confirm false alarm review queue retrain uncertainty human in the loop' },
      { to: '/app/pipeline', label: 'Pipeline', icon: Cpu, keywords: 'scan run ingest process stages sse' },
    ],
  },
  {
    title: 'Operate',
    items: [
      { to: '/app/operations', label: 'Field Ops', icon: Ship, keywords: 'operations missions dispatch crew kanban response' },
      { to: '/app/analytics', label: 'Analytics & Reports', icon: BarChart3, keywords: 'charts trends stats export pdf csv geojson report builder eval' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/app/settings', label: 'Settings', icon: SettingsIcon, keywords: 'profile 2fa preferences notifications sessions' },
      { to: '/app/admin', label: 'Admin', icon: ShieldCheck, adminOnly: true, keywords: 'users roles system engine regions services' },
    ],
  },
];
