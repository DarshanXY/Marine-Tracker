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
  Radar, Map as MapIcon, Layers, BookMarked,
  BarChart3, Settings as SettingsIcon, ShieldCheck,
} from 'lucide-react';
import { ROLE_LEVEL, type UserRole } from '@/types';

export type NavItem = {
  to: string;
  label: string;
  icon: typeof Radar;
  end?: boolean;
  /** Minimum role needed to see + open this page. Absent = every role (FIELD+).
   *  Enforced in the sidebar, the command palette, and by <RequireRole> on the
   *  route itself so a hidden page can't be reached by typing its URL either. */
  minRole?: UserRole;
  keywords?: string;
};
export type NavSection = { title: string; items: NavItem[] };

/** True when a user with `role` is allowed to see `item`. Single source of truth
 *  shared by the sidebar (AppLayout) and the command palette. */
export function navItemAllowed(item: NavItem, role?: UserRole): boolean {
  if (!item.minRole) return true;
  if (!role) return false;
  return ROLE_LEVEL[role] >= ROLE_LEVEL[item.minRole];
}

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
    title: 'Operate',
    items: [
      { to: '/app/analytics', label: 'Analytics & Reports', icon: BarChart3, minRole: 'COASTGUARD', keywords: 'charts trends stats export pdf csv geojson report builder eval' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/app/settings', label: 'Settings', icon: SettingsIcon, keywords: 'profile 2fa preferences notifications sessions' },
      { to: '/app/admin', label: 'Admin', icon: ShieldCheck, minRole: 'ADMIN', keywords: 'users roles system engine regions services' },
    ],
  },
];
