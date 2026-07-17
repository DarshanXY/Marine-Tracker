import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, ShieldAlert, Smartphone, KeyRound, LogOut, Check, Sparkles } from 'lucide-react';
import { PageHeader, Card, Button, Badge, RoleBadge, Toast, type Role } from '@/components';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import type { TwoFactorSetup } from '@/types';
import { useLocation, useNavigate } from 'react-router-dom';

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const promptTotp = Boolean((location.state as { promptTotp?: boolean } | null)?.promptTotp);
  const autoStarted = useRef(false);

  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  // Arriving from sign-up → auto-open 2FA setup (only for a real backend session).
  useEffect(() => {
    if (autoStarted.current) return;
    if (!promptTotp || !accessToken || !user || user.totpEnabled) return;
    autoStarted.current = true;
    setBusy(true);
    api.twoFactorSetup().then(setSetup).catch(() => {}).finally(() => setBusy(false));
  }, [promptTotp, accessToken, user]);

  if (!user) return null;

  const startSetup = async () => {
    setBusy(true);
    try {
      const data = await api.twoFactorSetup();
      setSetup(data);
    } catch {
      Toast.error('2FA setup needs the backend running and a real login session (not the offline demo).');
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      const ok = await api.twoFactorEnable(code.trim());
      if (ok) {
        await refreshUser();
        setSetup(null);
        setCode('');
        Toast.success('Two-factor authentication enabled');
      }
    } catch (err) {
      Toast.error((err as Error).message || 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await api.twoFactorDisable();
      await refreshUser();
      Toast.success('Two-factor authentication disabled');
    } catch {
      Toast.error('Could not disable 2FA — is the backend running?');
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Manage your profile and account security." />

      {promptTotp && !user.totpEnabled && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-xl border border-ocean-300 bg-ocean-50 px-4 py-3"
        >
          <Sparkles size={18} className="flex-shrink-0 text-ocean-600" />
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">Welcome aboard!</span> Secure your new account by
            enabling two-factor authentication below.
          </p>
        </motion.div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Profile */}
        <Card accent className="flex flex-col gap-4">
          <h3 className="font-display text-sm font-semibold text-slate-800">Profile</h3>
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-ocean-600 to-ocean-400 font-display text-xl font-bold text-white">
              {user.displayName.charAt(0)}
            </span>
            <div>
              <p className="font-display text-lg font-bold text-slate-800">{user.displayName}</p>
              <p className="font-mono text-xs text-slate-400">{user.username}</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <Row label="Email" value={user.email} />
            <Row label="Role" value={<RoleBadge role={user.role.toLowerCase() as Role} />} />
            <Row label="Clearance level" value={<span className="font-mono">L{user.level}</span>} />
          </div>
          <Button variant="outline" size="sm" icon={<LogOut size={15} />} onClick={onLogout} className="mt-2 self-start">
            Sign out
          </Button>
        </Card>

        {/* Security / 2FA */}
        <Card accent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
              <KeyRound size={15} className="text-ocean-600" /> Two-factor authentication
            </h3>
            <Badge variant={user.totpEnabled ? 'success' : 'neutral'} dot>
              {user.totpEnabled ? 'enabled' : 'disabled'}
            </Badge>
          </div>

          {user.totpEnabled ? (
            <div className="flex flex-col gap-3">
              <p className="flex items-start gap-2 text-sm text-slate-500">
                <ShieldCheck size={18} className="mt-0.5 flex-shrink-0 text-success-500" />
                Your account is protected with a time-based one-time password (TOTP). You'll be asked for a
                6-digit code at sign-in.
              </p>
              <Button variant="danger" size="sm" loading={busy} onClick={disable} className="self-start">
                Disable 2FA
              </Button>
            </div>
          ) : !setup ? (
            <div className="flex flex-col gap-3">
              <p className="flex items-start gap-2 text-sm text-slate-500">
                <ShieldAlert size={18} className="mt-0.5 flex-shrink-0 text-warn" />
                Add an authenticator app (Google Authenticator, Authy, 1Password) for a second layer of
                security — recommended for privileged roles.
              </p>
              <Button variant="primary" size="sm" icon={<Smartphone size={15} />} loading={busy} onClick={startSetup} className="self-start">
                Enable 2FA
              </Button>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
              <p className="text-sm text-slate-500">1. Scan this QR code with your authenticator app:</p>
              <div className="flex items-center gap-4">
                <img src={setup.qrDataUrl} alt="2FA QR code" className="h-36 w-36 rounded-xl border border-border bg-white p-1" />
                <div className="text-xs text-slate-500">
                  <p className="mb-1">Or enter the secret manually:</p>
                  <code className="block break-all rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-700">{setup.secret}</code>
                </div>
              </div>
              <p className="text-sm text-slate-500">2. Enter the 6-digit code it shows:</p>
              <div className="flex items-center gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  placeholder="123456"
                  className="input-glow w-36 rounded-xl border border-border bg-white/80 px-3 py-2 font-mono text-sm tracking-widest outline-none focus:border-ocean-400"
                />
                <Button variant="primary" size="sm" icon={<Check size={15} />} loading={busy} onClick={enable}>
                  Verify &amp; enable
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setSetup(null); setCode(''); }}>Cancel</Button>
              </div>
            </motion.div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
