import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Logo } from './Logo';
import { Footer } from './Footer';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About', end: false },
  { to: '/docs', label: 'Docs', end: false },
  { to: '/contact', label: 'Contact', end: false },
];

export function MarketingLayout() {
  const [open, setOpen] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const dashHref = isAuthenticated ? '/app' : '/login';

  return (
    <div className="flex min-h-screen flex-col">
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="sticky top-0 z-40 border-b border-border/60 bg-white/70 backdrop-blur-lg"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" aria-label="Home"><Logo /></Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'text-ocean-700' : 'text-slate-500 hover:text-ocean-600',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <Link
              to={dashHref}
              className="ml-2 inline-flex items-center gap-1.5 rounded-lg bg-ocean-600 px-4 py-2 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5"
            >
              Open Dashboard <ArrowRight size={15} />
            </Link>
          </nav>

          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {open && (
          <div className="border-t border-border/60 bg-white/90 px-6 py-3 md:hidden">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-ocean-50"
              >
                {item.label}
              </NavLink>
            ))}
            <Link
              to={dashHref}
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-ocean-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Open Dashboard <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </motion.header>

      <main className="flex-1">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
