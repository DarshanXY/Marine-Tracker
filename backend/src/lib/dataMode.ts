/**
 * Data-source mode.
 *
 * The API serves live data from Postgres when reachable, and transparently
 * falls back to the bundled demo dataset otherwise (or when DEMO_MODE=true).
 * This lets the whole backend run and return realistic data with NO database —
 * ideal for the pilot / examiner demo — while remaining production-ready.
 */
import { prisma } from './prisma';
import { env } from './env';
import { logger } from './logger';

export const dataMode = {
  probed: false,
  dbHealthy: false,
};

/** One-time probe at startup; safe to call again. */
export async function probeDatabase(): Promise<boolean> {
  if (env.DEMO_MODE) {
    dataMode.dbHealthy = false;
    dataMode.probed = true;
    logger.info('DEMO_MODE=true → serving bundled demo dataset (no DB required).');
    return false;
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    dataMode.dbHealthy = true;
    logger.info('Database reachable → serving live data.');
  } catch {
    dataMode.dbHealthy = false;
    if (env.dataStrict) {
      // Fail fast: a real deployment must not silently boot into demo mode.
      throw new Error(
        'DATA_STRICT=1 and DEMO_MODE=false, but the database is unreachable. ' +
        'Refusing to start in silent-demo mode — start Postgres (infra\\start-db.cmd) or unset DATA_STRICT.',
      );
    }
    logger.warn('Database unreachable → falling back to demo dataset.');
  }
  dataMode.probed = true;
  return dataMode.dbHealthy;
}

/** True when a real deployment must never quietly fall back to demo data. */
export function strictReal(): boolean {
  return env.dataStrict && !env.DEMO_MODE;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Re-probe the database on an interval so the API self-heals: when Postgres dies
 * and the watchdog (infra/watchdog.ps1) revives it, the backend returns to live
 * `db` mode on its own instead of being stuck in demo mode until a manual
 * restart. This is what lets continuous auto-detection keep persisting results.
 * No-op under DEMO_MODE or if already polling.
 */
export function startDbHealthPolling(intervalMs = 30_000): void {
  if (env.DEMO_MODE || pollTimer) return;
  pollTimer = setInterval(async () => {
    const was = dataMode.dbHealthy;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dataMode.dbHealthy = true;
    } catch {
      dataMode.dbHealthy = false;
    }
    dataMode.probed = true;
    if (dataMode.dbHealthy !== was) {
      if (dataMode.dbHealthy) logger.info('Database recovered → serving live data again.');
      else logger.warn('Database lost → falling back to demo dataset until it returns.');
    }
  }, intervalMs);
  // Don't keep the event loop alive just for the health poll.
  pollTimer.unref?.();
}

/** True when responses should come from the demo dataset. */
export function isDemo(): boolean {
  return env.DEMO_MODE || !dataMode.dbHealthy;
}

/** Label for the X-Data-Source response header. */
export function sourceLabel(): 'demo' | 'db' {
  return isDemo() ? 'demo' : 'db';
}
