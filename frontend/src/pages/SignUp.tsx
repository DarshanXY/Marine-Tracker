import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus, ArrowLeft, User, Mail, Lock, Check } from 'lucide-react';
import { Button } from '@/components';
import { Logo } from '@/components/layout/Logo';
import { useAuthStore } from '@/stores/authStore';

function strength(pw: string): { score: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['#EF4444', '#F59E0B', '#F59E0B', '#14B8A6', '#0D9488'];
  return { score: s, label: labels[s], color: colors[s] };
}

export default function SignUp() {
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const pw = strength(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (username.trim().length < 3) return setError('Username must be at least 3 characters.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setLoading(true);
    const result = await register(username.trim(), email.trim(), password);
    // Guide new users to secure their account with 2FA right away.
    if (result.ok) navigate('/app/settings', { replace: true, state: { promptTotp: true } });
    else {
      setError(result.error ?? 'Sign-up failed');
      setLoading(false);
    }
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
              <h1 className="font-display text-xl font-bold text-slate-900">Create account</h1>
              <p className="mt-1 text-sm text-slate-500">Request access to the operations console</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field icon={<User size={16} />} label="Username">
              <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} placeholder="jane_ocean" autoComplete="username" />
            </Field>
            <Field icon={<Mail size={16} />} label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="jane@agency.gov.in" autoComplete="email" />
            </Field>
            <Field icon={<Lock size={16} />} label="Password">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="At least 8 characters" autoComplete="new-password" />
            </Field>

            {password && (
              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < pw.score ? pw.color : '#E2E8F0' }} />
                  ))}
                </div>
                <span className="text-xs font-medium" style={{ color: pw.color }}>{pw.label}</span>
              </div>
            )}

            <Field icon={<Check size={16} />} label="Confirm password">
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} placeholder="Re-enter password" autoComplete="new-password" />
            </Field>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

            <Button type="submit" variant="primary" fullWidth loading={loading} icon={<UserPlus size={16} />}>
              Create account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-ocean-600 hover:text-ocean-700">Sign in</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

const inputCls = 'w-full bg-transparent py-2.5 text-sm outline-none';

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <div className="input-glow flex items-center gap-2 rounded-xl border border-border bg-white/80 px-3">
        <span className="text-slate-400">{icon}</span>
        {children}
      </div>
    </label>
  );
}
