import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn, ArrowLeft, ShieldCheck, User, Lock } from 'lucide-react';
import { Button, RoleBadge, type Role } from '@/components';
import { Logo } from '@/components/layout/Logo';
import { useAuthStore, DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/stores/authStore';
import type { UserRole } from '@/types';

export default function Login() {
  const login = useAuthStore((s) => s.login);
  const loginAs = useAuthStore((s) => s.loginAs);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  const [identifier, setIdentifier] = useState('cg_officer');
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await login(identifier, password, needsTotp ? totp : undefined);
    if (result.ok) {
      navigate(from, { replace: true });
      return;
    }
    if (result.needsTotp) {
      setNeedsTotp(true);
    } else {
      setError(result.error ?? 'Login failed');
    }
    setLoading(false);
  };

  const quickLogin = async (role: Role) => {
    setLoading(true);
    setError('');
    const upper = role.toUpperCase() as UserRole;
    const account = DEMO_ACCOUNTS.find((a) => a.role === upper);
    const result = await loginAs(upper);
    if (result.ok) {
      navigate(from, { replace: true });
      return;
    }
    if (result.needsTotp) {
      // This account has 2FA enabled — quick-login can't send a code, so hand off
      // to the form with the account pre-filled and prompt for the 6-digit code.
      if (account) {
        setIdentifier(account.username);
        setPassword(DEMO_PASSWORD);
      }
      setNeedsTotp(true);
      setError('This account has 2FA enabled — enter the 6-digit code from your authenticator.');
      setLoading(false);
      return;
    }
    setError(result.error ?? 'Login failed');
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-ocean-600">
          <ArrowLeft size={15} /> Back to home
        </Link>

        <div className="glass-lg card-accent relative p-8">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <Logo showText={false} />
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900">Sign in</h1>
              <p className="mt-1 text-sm text-slate-500">Marine Plastic Tracker operations console</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Username or email</span>
              <div className="input-glow flex items-center gap-2 rounded-xl border border-border bg-white/80 px-3">
                <User size={16} className="text-slate-400" />
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full bg-transparent py-2.5 text-sm outline-none"
                  placeholder="cg_officer"
                  autoComplete="username"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Password</span>
              <div className="input-glow flex items-center gap-2 rounded-xl border border-border bg-white/80 px-3">
                <Lock size={16} className="text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent py-2.5 text-sm outline-none"
                  placeholder="Demo@1234!"
                  autoComplete="current-password"
                />
              </div>
            </label>

            {needsTotp && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">2FA code</span>
                <div className="input-glow flex items-center gap-2 rounded-xl border border-border bg-white/80 px-3">
                  <ShieldCheck size={16} className="text-slate-400" />
                  <input
                    value={totp}
                    onChange={(e) => setTotp(e.target.value)}
                    inputMode="numeric"
                    className="w-full bg-transparent py-2.5 font-mono text-sm tracking-widest outline-none"
                    placeholder="123456"
                    autoComplete="one-time-code"
                  />
                </div>
                <span className="mt-1.5 block text-[11px] text-slate-400">
                  Lost your authenticator? In this demo, restarting the backend resets 2FA on the seeded accounts.
                </span>
              </label>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
            )}

            <Button type="submit" variant="primary" fullWidth loading={loading} icon={<LogIn size={16} />}>
              {needsTotp ? 'Verify & sign in' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            No account?{' '}
            <Link to="/signup" className="font-semibold text-ocean-600 hover:text-ocean-700">Create one</Link>
          </p>

          <div className="mt-6 border-t border-border/60 pt-5">
            <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck size={13} /> Demo — one click as any role (password: <span className="font-mono">{DEMO_PASSWORD}</span>)
            </p>
            <div className="flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.role}
                  type="button"
                  onClick={() => quickLogin(a.role.toLowerCase() as Role)}
                  className="transition-transform hover:-translate-y-0.5"
                  title={`Sign in as ${a.displayName}`}
                >
                  <RoleBadge role={a.role.toLowerCase() as Role} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
