import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Menu, Wifi, WifiOff, Database, Search } from 'lucide-react';
import { Logo } from './Logo';
import { OnboardingTour } from './OnboardingTour';
import { CommandPalette } from './CommandPalette';
import { NotificationCenter } from './NotificationCenter';
import { RoleBadge, type Role } from '@/components';
import { useAuthStore } from '@/stores/authStore';
import { useSatelliteStatus } from '@/hooks/useApi';
import { useAlertNotifications } from '@/hooks/useAlertNotifications';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { NAV_SECTIONS } from '@/config/nav';

function DataBadge() {
  const { data, isLoading } = useSatelliteStatus();
  const source = api.source();

  if (isLoading) {
    return <span className="text-xs text-slate-400">Connecting…</span>;
  }

  const offline = source === 'mock';
  const live = !offline && data?.mode === 'live';

  const cfg = offline
    ? { icon: WifiOff, label: 'Offline · mock', cls: 'bg-amber-100 text-amber-700' }
    : live
      ? { icon: Wifi, label: 'Live satellite', cls: 'bg-success-100 text-success-700' }
      : { icon: Database, label: 'Demo data', cls: 'bg-ocean-50 text-ocean-700' };
  const Icon = cfg.icon;

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', cfg.cls)}
      title={data?.message ?? 'Backend not reachable — showing bundled mock data'}
    >
      <Icon size={12} /> {cfg.label}
    </span>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  useAlertNotifications(); // toast + browser notification on new HIGH alerts

  const onLogout = () => {
    logout();
    navigate('/');
  };

  const sections = NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.adminOnly || user?.role === 'ADMIN') }))
    .filter((s) => s.items.length > 0);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Link to="/" aria-label="Home"><Logo /></Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        {sections.map((section) => (
          <div key={section.title} className="mb-1">
            <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-ocean-600 text-white shadow-glow-primary'
                        : 'text-slate-600 hover:bg-ocean-50 hover:text-ocean-700',
                    )
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {user && (
        <div className="m-3 rounded-xl border border-border/70 bg-white/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{user.displayName}</p>
              <p className="truncate font-mono text-[11px] text-slate-400">{user.username}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
          <div className="mt-2">
            <RoleBadge role={user.role.toLowerCase() as Role} />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-shrink-0 border-r border-border/70 bg-white/60 backdrop-blur-lg lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="fixed inset-y-0 left-0 z-50 w-64 border-r border-border/70 bg-white lg:hidden"
            >
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/70 bg-white/70 px-4 py-3 backdrop-blur-lg lg:px-8">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          {/* Command-palette trigger (⌘K) */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
            className="hidden items-center gap-2 rounded-lg border border-border/70 bg-white/60 px-3 py-1.5 text-sm text-slate-400 transition-colors hover:border-ocean-300 hover:text-ocean-700 lg:flex"
            aria-label="Open command palette"
          >
            <Search size={15} />
            <span>Search…</span>
            <kbd className="rounded border border-border bg-slate-50 px-1.5 font-mono text-[10px] text-slate-400">⌘K</kbd>
          </button>

          <div className="flex items-center gap-2">
            <NotificationCenter />
            <DataBadge />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      <OnboardingTour />
      <CommandPalette />
    </div>
  );
}
