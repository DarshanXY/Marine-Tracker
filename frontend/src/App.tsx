import { Component, lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'react-hot-toast';

import { queryClient } from '@/lib/queryClient';
import { WaveBackground } from '@/components/effects/WaveBackground';
import { ParticleField } from '@/components/effects/ParticleField';
import { ScrollToTop } from '@/components/layout/ScrollToTop';
import { MarketingLayout } from '@/components/layout/MarketingLayout';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { RequireRole } from '@/components/layout/RequireRole';

// Route pages are lazy-loaded so heavy libs (recharts, leaflet) only ship when
// their page is visited — keeps the initial bundle small.
const Landing = lazy(() => import('@/pages/Landing'));
const About = lazy(() => import('@/pages/About'));
const Contact = lazy(() => import('@/pages/Contact'));
const Documentation = lazy(() => import('@/pages/Documentation'));
const FAQ = lazy(() => import('@/pages/FAQ'));
const Terms = lazy(() => import('@/pages/Terms'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const Compliance = lazy(() => import('@/pages/Compliance'));
const Login = lazy(() => import('@/pages/Login'));
const SignUp = lazy(() => import('@/pages/SignUp'));
// IA v2 consolidated pages (14 → 10)
const CommandCenter = lazy(() => import('@/pages/CommandCenter'));   // merges Dashboard + Live Ops + Alerts
const Records = lazy(() => import('@/pages/Records'));               // merges Detections + Hotspots
const AnalyticsReports = lazy(() => import('@/pages/AnalyticsReports')); // merges Analytics + Reports
const MapExplorer = lazy(() => import('@/pages/MapExplorer'));
const Areas = lazy(() => import('@/pages/Areas'));           // saved AOIs + 72h drift forecasting
const Settings = lazy(() => import('@/pages/Settings'));
const DetectionDetail = lazy(() => import('@/pages/DetectionDetail'));
const HotspotDetail = lazy(() => import('@/pages/HotspotDetail'));
const AdminPanel = lazy(() => import('@/pages/AdminPanel'));
const NotFound = lazy(() => import('@/pages/NotFound'));

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-ocean-200 border-t-ocean-600" />
    </div>
  );
}

/** Catches render + lazy-chunk-load errors (the classic "Failed to fetch
 *  dynamically imported module" after the dev server restarts under an open
 *  tab) and offers a one-click reload instead of a blank page. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunkError = /fetch dynamically imported module|Loading chunk|import/i.test(this.state.error.message);
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="font-display text-lg font-bold text-slate-800">
          {chunkError ? 'The app was updated behind this tab' : 'Something went wrong'}
        </p>
        <p className="max-w-md text-sm text-slate-500">
          {chunkError
            ? 'The dev server restarted (or a new version deployed) while this tab was open, so a page module could not be loaded.'
            : this.state.error.message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-glow-primary"
        >
          Reload the app
        </button>
      </div>
    );
  }
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* reducedMotion="user" → all opacity/transform motion auto-flattens for
          visitors who set "prefers-reduced-motion" at the OS level. */}
      <MotionConfig reducedMotion="user">
      <BrowserRouter>
        {/* Fixed animated ocean background behind everything */}
        <WaveBackground />
        <ParticleField count={40} />

        <ScrollToTop />

        <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public / marketing */}
            <Route element={<MarketingLayout />}>
              <Route path="/" element={<Landing />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/docs" element={<Documentation />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/compliance" element={<Compliance />} />
            </Route>

            {/* Auth */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />

            {/* Protected app */}
            <Route element={<ProtectedRoute />}>
              <Route path="/app" element={<AppLayout />}>
                {/* Monitor — FIELD+ (every authenticated role) */}
                <Route index element={<CommandCenter />} />
                <Route path="map" element={<MapExplorer />} />
                <Route path="areas" element={<Areas />} />
                <Route path="records" element={<Records />} />
                <Route path="detections/:id" element={<DetectionDetail />} />
                <Route path="hotspots/:id" element={<HotspotDetail />} />
                {/* Operate */}
                <Route path="operations" element={<Navigate to="/app" replace />} />
                {/* System */}
                <Route path="settings" element={<Settings />} />

                {/* COASTGUARD+ only — kept in sync with nav.ts minRole */}
                <Route element={<RequireRole minRole="COASTGUARD" />}>
                  <Route path="analytics" element={<AnalyticsReports />} />
                </Route>

                {/* ADMIN only — user/system administration */}
                <Route element={<RequireRole minRole="ADMIN" />}>
                  <Route path="admin" element={<AdminPanel />} />
                </Route>

                {/* ── Permanent redirects for retired routes (no bookmark 404s) ── */}
                <Route path="ops" element={<Navigate to="/app" replace />} />
                <Route path="alerts" element={<Navigate to="/app" replace />} />
                <Route path="detections" element={<Navigate to="/app/records" replace />} />
                <Route path="hotspots" element={<Navigate to="/app/records" replace />} />
                <Route path="model" element={<Navigate to="/app" replace />} />
                <Route path="intelligence" element={<Navigate to="/app" replace />} />
                <Route path="reports" element={<Navigate to="/app/analytics" replace />} />
                {/* Pipeline module removed — scanning now lives on Map Explorer / Areas */}
                <Route path="pipeline" element={<Navigate to="/app/map" replace />} />
                {/* Active Learning module removed — labeling now lives on Records */}
                <Route path="active-learning" element={<Navigate to="/app/records" replace />} />
              </Route>
            </Route>

            {/* Redirects + 404 */}
            <Route path="/dashboard" element={<Navigate to="/app" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>

        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(13,148,136,0.2)',
              borderRadius: '12px',
              color: '#1E293B',
              fontSize: '14px',
              boxShadow: '0 8px 32px rgba(13,148,136,0.12)',
            },
            success: { iconTheme: { primary: '#10B981', secondary: '#fff' } },
            error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
          }}
        />
      </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  );
}
