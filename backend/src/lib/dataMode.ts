/**
 * Data-source mode.
 *
 * The API serves live data from Postgres when reachable, and transparently
 * falls back to the bundled demo dataset otherwise (or when DEMO_MODE=true).
 * This lets the whole backend run and return realistic data with NO database —
 * ideal for the pilot / examiner demo — while remaining production-ready.
 */
import { env } from './env';
import { logger } from './logger';
import { connectDatabase, connectionLogPath, pingDatabase, summarize } from './db';

export const dataMode = {
  probed: false,
  dbHealthy: false,
  /** Latency of the last successful probe, surfaced by /health. */
  latencyMs: null as number | null,
};

/**
 * One-time probe at startup; safe to call again.
 *
 * Delegates to `connectDatabase()`, which opens the pool explicitly (with
 * backoff retry) and appends the outcome to the connection log — so a boot is
 * always auditable after the fact, whether it succeeded or not.
 */
export async function probeDatabase(): Promise<boolean> {
  if (env.DEMO_MODE) {
    dataMode.dbHealthy = false;
    dataMode.probed = true;
    logger.info('DEMO_MODE=true → serving bundled demo dataset (no DB required).');
    return false;
  }

  const info = await connectDatabase();
  dataMode.dbHealthy = info.connected;
  dataMode.latencyMs = info.latencyMs;
  dataMode.probed = true;

  if (info.connected) {
    logger.info(summarize(info));
    logger.info(`Connection log: ${connectionLogPath()}`);
    return true;
  }

  if (env.dataStrict) {
    // Fail fast: a real deployment must not silently boot into demo mode.
    throw new Error(
      'DATA_STRICT=1 and DEMO_MODE=false, but the database is unreachable ' +
      `(${info.error}). Refusing to start in silent-demo mode — start Postgres ` +
      '(infra\\start-db.cmd) or unset DATA_STRICT.',
    );
  }
  logger.warn(`Database unreachable (${info.error}) → falling back to demo dataset.`);
  return false;
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
export function startDbHealthPolling(intervalMs = env.db.healthIntervalMs): void {
  if (env.DEMO_MODE || pollTimer) return;
  pollTimer = setInterval(async () => {
    const was = dataMode.dbHealthy;
    const latency = await pingDatabase();
    dataMode.dbHealthy = latency !== null;
    dataMode.latencyMs = latency;
    dataMode.probed = true;
    if (dataMode.dbHealthy === was) return;
    if (dataMode.dbHealthy) {
      // Re-run the full connect so the recovery is captured in the log too:
      // one attempt only, since we already know the cluster answers.
      const info = await connectDatabase({ attempts: 1, silent: true });
      logger.info(`Database recovered → serving live data again. ${summarize(info)}`);
    } else {
      logger.warn('Database lost → falling back to demo dataset until it returns.');
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
