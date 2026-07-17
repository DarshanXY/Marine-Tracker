/**
 * Live ops — server-push of pipeline events over WebSocket (/ws/live).
 *
 * A tiny in-process event bus (`publishLive`) that anything can emit into
 * (persistence, the BullMQ worker, the scheduler), plus a WebSocketServer
 * attached to the main HTTP server that broadcasts every event as JSON.
 * Push-only and best-effort: the UI keeps polling as its fallback, so a
 * dropped socket never loses data — it just loses immediacy.
 */
import { EventEmitter } from 'events';
import type { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from './logger';

export interface LiveEvent {
  type: 'run' | 'alert' | 'job' | 'schedule' | 'hello';
  at: string;
  [key: string]: unknown;
}

const bus = new EventEmitter();
bus.setMaxListeners(20);

/** Emit a live event to every connected dashboard. */
export function publishLive(event: Omit<LiveEvent, 'at'>): void {
  bus.emit('event', { ...event, at: new Date().toISOString() });
}

export function attachLiveSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws/live' });

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'hello', at: new Date().toISOString() }));
  });

  bus.on('event', (event: LiveEvent) => {
    const payload = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  });

  // Keepalive: terminate dead connections so broadcasts don't pile up.
  const interval = setInterval(() => {
    for (const client of wss.clients) {
      client.ping();
    }
  }, 30_000);
  wss.on('close', () => clearInterval(interval));

  logger.info('Live ops WebSocket listening on /ws/live');
}
