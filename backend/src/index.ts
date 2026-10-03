/**
 * Marine Plastic Tracker — Backend (Phase 3)
 * Domain API: /api/stats, /detections, /hotspots, /regions, /alerts, /satellite.
 *
 * Serves live data from Postgres when reachable, and transparently falls back
 * to the bundled demo dataset otherwise (or when DEMO_MODE=true) — so the API
 * runs and returns realistic data with no database required.
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { env } from './lib/env';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { dataMode, probeDatabase, startDbHealthPolling, sourceLabel } from './lib/dataMode';
import { lastConnectionInfo, pingDatabase } from './lib/db';
import api from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Re-export the shared client for any legacy import sites.
export { prisma };

const app = express();

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
    exposedHeaders: ['X-Data-Source'],
  }),
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// One shared IP budget for all API traffic, including the dashboard's own
// background polling (services every 8s, alerts every 30s app-wide,
// pipeline-status every 15s, operations every 20s, ...) — that alone can
// exceed 300 req/15min from a single open tab, which used to starve unrelated
// requests like login of their share. Sized with headroom for several tabs;
// login/register get their own much stricter limiter (see auth.routes.ts) so
// this general budget isn't the thing standing between an attacker and
// unlimited password guesses. /health is exempt since it's polled for status
// chips and isn't a target worth throttling.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
    message: { error: { status: 429, message: 'Too many requests — slow down.' } },
  }),
);

// Tag every response with the data source so the UI can show a live/demo badge.
app.use((_req, res, next) => {
  res.setHeader('X-Data-Source', sourceLabel());
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const dbLatencyMs = await pingDatabase();
  const dbStatus: 'connected' | 'error' = dbLatencyMs === null ? 'error' : 'connected';
  const info = lastConnectionInfo();

  const healthy = dbStatus === 'connected' || env.DEMO_MODE;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    version: '0.2.0',
    phase: 'Phase 3 — domain API',
    mode: sourceLabel(),
    demoMode: env.DEMO_MODE,
    db: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      target: info?.target ?? null,
      server: info?.server?.serverVersion ?? null,
      pool: info?.pool ?? null,
      tables: info?.tables.length ?? null,
      connectedAt: info?.connected ? info.at : null,
    },
    time: new Date().toISOString(),
  });
});

// ── Root ──────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'Marine Plastic Tracker API',
    version: '0.2.0',
    api: '/api',
    health: '/health',
  });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', api);

// ── 404 + error handling ──────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await probeDatabase();
  // Keep re-checking the DB so the API returns to live `db` mode by itself once
  // the watchdog revives Postgres — no manual restart needed.
  startDbHealthPolling();
  // BullMQ worker: ALWAYS started — BullMQ retries the Redis connection
  // forever, so the worker picks up jobs whenever Redis appears (booting while
  // Redis is down must not permanently disable the queue). Routes still probe
  // per-request and fall back to the direct path while Redis is unreachable.
  const { queueAvailable, startWorker, startScheduler } = await import('./lib/queue');
  startWorker();
  if (!(await queueAvailable())) {
    logger.warn('Redis unreachable — runs execute directly until it returns (infra\\start-redis.cmd).');
  }
  // Internal continuous scanner (no external OS cron). No-op unless SCHEDULER_ENABLED.
  await startScheduler();
  const server = app.listen(env.port, () => {
    logger.info(`Backend listening on http://localhost:${env.port}`);
    logger.info(`Health:  http://localhost:${env.port}/health`);
    logger.info(`API:     http://localhost:${env.port}/api`);
    logger.info(`Data source: ${sourceLabel().toUpperCase()} (demoMode=${env.DEMO_MODE}, dbHealthy=${dataMode.dbHealthy})`);
  });
  const { attachLiveSocket } = await import('./lib/live');
  attachLiveSocket(server);
}

void start();

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal: string): Promise<void> => {
  logger.info(`${signal} received — closing queue + disconnecting Prisma…`);
  try {
    const { closeQueue } = await import('./lib/queue');
    await closeQueue();
  } catch { /* queue never started */ }
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export default app;
