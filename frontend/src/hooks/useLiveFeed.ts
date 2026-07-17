/**
 * Live ops feed — native WebSocket to the backend's /ws/live push channel.
 *
 * Returns connection state plus a capped rolling list of events. On 'run' and
 * 'alert' events it invalidates the affected react-query caches, so dashboards
 * update the moment a pipeline run persists — polling remains the fallback
 * when the socket is down (push improves latency, never correctness).
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface LiveEvent {
  type: 'run' | 'alert' | 'job' | 'schedule' | 'hello';
  at: string;
  [key: string]: unknown;
}

const MAX_EVENTS = 50;
const RECONNECT_BASE_MS = 2_000;

export function useLiveFeed(): { connected: boolean; events: LiveEvent[] } {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const qc = useQueryClient();
  const retryRef = useRef(0);

  useEffect(() => {
    if (typeof WebSocket === 'undefined') return; // non-browser env (tests) — polling covers it
    let socket: WebSocket | null = null;
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${proto}://${window.location.host}/ws/live`);

      socket.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };

      socket.onmessage = (msg) => {
        let event: LiveEvent;
        try {
          event = JSON.parse(msg.data as string) as LiveEvent;
        } catch {
          return;
        }
        if (event.type === 'hello') return;
        setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
        // Push-invalidate whatever this event changed.
        if (event.type === 'run') {
          for (const key of ['detections', 'hotspots', 'overview', 'trend', 'by-region', 'by-class', 'pipeline-logs']) {
            void qc.invalidateQueries({ queryKey: [key] });
          }
        }
        if (event.type === 'alert') {
          void qc.invalidateQueries({ queryKey: ['alerts'] });
          void qc.invalidateQueries({ queryKey: ['overview'] });
        }
        if (event.type === 'job') {
          void qc.invalidateQueries({ queryKey: ['pipeline-status'] });
        }
      };

      const scheduleReconnect = () => {
        if (closed) return;
        setConnected(false);
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** retryRef.current, 30_000);
        retryRef.current += 1;
        timer = setTimeout(connect, delay);
      };

      socket.onclose = scheduleReconnect;
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [qc]);

  return { connected, events };
}
