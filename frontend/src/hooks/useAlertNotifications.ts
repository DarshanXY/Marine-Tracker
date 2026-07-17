/**
 * HIGH-alert notifications — polls open alerts and announces NEW high-severity
 * ones via an in-app toast plus (when the user grants permission) a browser
 * notification. First poll only baselines the seen-set so a page load never
 * replays old alerts; seen ids persist in localStorage across sessions.
 */
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

const SEEN_KEY = 'mpt-seen-alert-ids';
const POLL_MS = 30_000;

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-500)));
}

function browserNotify(title: string, body: string): void {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.svg' });
  } else if (Notification.permission === 'default') {
    void Notification.requestPermission().then((p) => {
      if (p === 'granted') new Notification(title, { body, icon: '/favicon.svg' });
    });
  }
}

export function useAlertNotifications(): void {
  const seenRef = useRef<Set<string> | null>(null);

  const { data } = useQuery({
    queryKey: ['alerts', 'notify-poll'],
    queryFn: () => api.alerts({ acked: false }),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!data) return;

    // First poll after mount: baseline only — never replay history as "new".
    if (seenRef.current === null) {
      const seen = loadSeen();
      data.forEach((a) => seen.add(a.id));
      seenRef.current = seen;
      saveSeen(seen);
      return;
    }

    const seen = seenRef.current;
    const fresh = data.filter((a) => !seen.has(a.id));
    if (fresh.length === 0) return;
    fresh.forEach((a) => seen.add(a.id));
    saveSeen(seen);

    // Announce HIGH severity only, max 3 per poll (a scheduled run over many
    // regions can land several at once).
    fresh
      .filter((a) => a.severity === 'HIGH')
      .slice(0, 3)
      .forEach((a) => {
        toast(`🚨 ${a.title}`, { duration: 8000, position: 'top-right' });
        browserNotify(a.title, a.message);
      });
  }, [data]);
}
