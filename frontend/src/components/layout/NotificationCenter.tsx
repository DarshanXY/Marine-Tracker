/**
 * Notification center — a persistent home for alerts that previously only flashed
 * by as toasts. Bell in the header with an unread count; the panel lists recent
 * alerts, lets Coast Guard+ acknowledge them inline, and links to the full board.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, Inbox } from 'lucide-react';
import { useAlerts, useAckAlert } from '@/hooks/useApi';
import { cn } from '@/lib/utils';

const SEV_DOT: Record<string, string> = {
  HIGH: 'bg-rose-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-ocean-500',
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: alerts } = useAlerts();
  const ack = useAckAlert();

  const list = (alerts ?? []).slice(0, 8);
  const unread = (alerts ?? []).filter((a) => !a.isAcked).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-ocean-50 hover:text-ocean-700"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border/70 bg-white shadow-glass"
            role="dialog" aria-label="Notifications"
          >
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
              <span className="text-sm font-semibold text-slate-800">Notifications</span>
              {unread > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">{unread} unread</span>}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {list.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <Inbox size={24} className="mx-auto text-slate-300" />
                  <p className="mt-2 text-sm text-slate-400">No alerts right now.</p>
                </div>
              )}
              {list.map((a) => (
                <div key={a.id} className={cn('flex gap-3 border-b border-border/50 px-4 py-3 last:border-0', !a.isAcked && 'bg-ocean-50/40')}>
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', SEV_DOT[a.severity] ?? 'bg-slate-400')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{a.title}</p>
                    <p className="line-clamp-2 text-xs text-slate-500">{a.message}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(a.createdAt)}</p>
                  </div>
                  {!a.isAcked && (
                    <button
                      type="button"
                      onClick={() => ack.mutate(a.id)}
                      disabled={ack.isPending}
                      title="Acknowledge"
                      className="h-fit rounded-md p-1.5 text-slate-400 transition-colors hover:bg-teal-50 hover:text-teal-600 disabled:opacity-60"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <Link
              to="/app"
              onClick={() => setOpen(false)}
              className="block border-t border-border/70 px-4 py-2.5 text-center text-xs font-medium text-ocean-700 hover:bg-ocean-50"
            >
              View all alerts
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
