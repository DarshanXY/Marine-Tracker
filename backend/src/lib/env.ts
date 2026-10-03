/**
 * Zero-dependency environment loader + typed config.
 *
 * Reads `.env` from the backend folder and the repo root WITHOUT requiring the
 * `dotenv` package — this keeps the ₹0 / low-friction setup (one less install).
 * Shell-provided variables always win; values in .env files never overwrite
 * anything already present in `process.env`.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

function parseEnvFile(file: string): void {
  let content: string;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return; // file absent — that's fine
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

// Load order (shell env already wins): backend/.env → repo-root/.env.
const cwd = process.cwd();
[
  path.resolve(cwd, '.env'),
  path.resolve(cwd, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
  path.resolve(__dirname, '..', '..', '..', '.env'),
].forEach(parseEnvFile);

const asBool = (v: string | undefined, def = false): boolean =>
  v === undefined ? def : /^(1|true|yes|on)$/i.test(v);

const asNum = (v: string | undefined, def: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

// ── PostgreSQL connection pool ───────────────────────────────────────────────
// Prisma opens ONE pool per PrismaClient and sizes it (cpu_threads * 2 + 1) by
// default — on a 16-thread box that is 33 sockets from a single `tsx watch`
// process, and the portable cluster in infra/pgdata only allows 100 total
// (psql, pgAdmin and Prisma Studio want their share too). The API is I/O-bound
// with short queries, so a smaller explicit pool serves the same throughput with
// far more headroom; the socket count is what we cap, not the request rate.
const dbPoolSize    = Math.max(1, asNum(process.env.DB_POOL_SIZE, Math.min(10, os.cpus().length * 2 + 1)));
// How long a request waits for a free socket before failing (Prisma default 10s).
const dbPoolTimeout = Math.max(1, asNum(process.env.DB_POOL_TIMEOUT, 15));
// How long a single new socket may take to establish (Prisma default 5s).
const dbConnTimeout = Math.max(1, asNum(process.env.DB_CONNECT_TIMEOUT, 10));
// Tags our sockets in pg_stat_activity so the connection log can tell OUR pool
// apart from psql/pgAdmin sessions.
const dbAppName     = process.env.DB_APP_NAME ?? 'marine-plastic-tracker-api';

/**
 * Return DATABASE_URL with the pool knobs applied. Values already present in the
 * URL always win, so an operator can override any of them per-environment
 * without touching code. A malformed URL is passed through untouched — Prisma
 * gives a far better error message for it than we would.
 */
function pooledDatabaseUrl(raw: string | undefined): string {
  if (!raw) return '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  const fallback = (key: string, value: string): void => {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  };
  fallback('connection_limit', String(dbPoolSize));
  fallback('pool_timeout',     String(dbPoolTimeout));
  fallback('connect_timeout',  String(dbConnTimeout));
  fallback('application_name', dbAppName);
  fallback('schema',           'public');
  return url.toString();
}

/** Host:port/db of a connection string, with the password stripped — log-safe. */
export function redactDatabaseUrl(raw: string): string {
  if (!raw) return '(unset)';
  try {
    const url = new URL(raw);
    const user = url.username ? `${url.username}@` : '';
    return `postgresql://${user}${url.host}${url.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

export const env = {
  nodeEnv:    process.env.NODE_ENV ?? 'development',
  isDev:      (process.env.NODE_ENV ?? 'development') === 'development',
  port:       asNum(process.env.PORT, 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  logLevel:   process.env.LOG_LEVEL ?? 'info',
  pythonEngineUrl: process.env.PYTHON_ENGINE_URL ?? 'http://localhost:8000',
  // Shared secret for /api/pipeline/scheduled-run (external cron). Empty = open (dev).
  schedulerToken: process.env.SCHEDULER_TOKEN ?? '',
  // BullMQ queue backend (portable local Redis: infra\start-redis.cmd).
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  /**
   * Continuous scanning: an internal BullMQ repeatable job that sweeps every
   * monitored region on an interval (no external OS cron needed). OFF by default
   * so it never silently burns CDSE Processing-Unit quota — set SCHEDULER_ENABLED=1
   * to turn real-time auto-scanning on. Interval matches Sentinel-2's ~5-day
   * revisit reality (default 6h; a scan only yields new data when a fresh pass exists).
   */
  scheduler: {
    enabled:    asBool(process.env.SCHEDULER_ENABLED, false),
    intervalMs: Math.max(15, asNum(process.env.SCAN_INTERVAL_MINUTES, 360)) * 60_000,
  },

  /**
   * DEMO_MODE (default true): serve seeded/mock data and skip the requirement
   * for a running PostgreSQL or real satellite credentials. Set to false once
   * you have a database + Sentinel Hub keys configured.
   */
  DEMO_MODE:  asBool(process.env.DEMO_MODE, true),

  /**
   * DATA_STRICT (default false): when DEMO_MODE=false, refuse to SILENTLY serve
   * the demo dataset. At boot the process fails fast if the database is
   * unreachable, and per-query fallbacks throw instead of returning mock — so a
   * "real" deployment can never quietly degrade to demo data unnoticed.
   */
  dataStrict: asBool(process.env.DATA_STRICT, false),

  /**
   * DEMO_PLASTIC (default true, TEMPORARY): when an area saved from Map Explorer
   * has no plastic, inject a labelled synthetic plastic cluster over open water so
   * the Areas drift forecast has something to release. Every injected detection
   * and the result itself carry `demo: true` / `demoPlastic` so the UI can say so.
   * Set to false once the live detector finds plastic again.
   */
  demoPlastic: asBool(process.env.DEMO_PLASTIC, true),

  // ── PostgreSQL ─────────────────────────────────────────────────────────────
  db: {
    /** Raw value as configured (still contains the password — never log it). */
    rawUrl: process.env.DATABASE_URL ?? '',
    /** What PrismaClient actually connects with: raw URL + pool knobs. */
    url: pooledDatabaseUrl(process.env.DATABASE_URL),
    configured: Boolean(process.env.DATABASE_URL),
    pool: {
      connectionLimit: dbPoolSize,
      poolTimeoutS:    dbPoolTimeout,
      connectTimeoutS: dbConnTimeout,
      applicationName: dbAppName,
    },
    /** Bounded retry for the boot-time connect (a cluster may still be starting). */
    retry: {
      attempts:  Math.max(1, asNum(process.env.DB_CONNECT_ATTEMPTS, 5)),
      baseMs:    Math.max(50, asNum(process.env.DB_RETRY_BASE_MS, 400)),
      maxMs:     Math.max(100, asNum(process.env.DB_RETRY_MAX_MS, 5_000)),
      /**
       * Hard ceiling on the whole retry loop. A refused TCP connect costs Prisma
       * ~4s to report, so `attempts` alone would let a DOWN database stall the
       * boot for ~26s before the API falls back to demo data and starts
       * listening. The deadline is what actually bounds that; attempts just caps
       * how many tries fit inside it.
       */
      deadlineMs: Math.max(1_000, asNum(process.env.DB_CONNECT_DEADLINE_MS, 12_000)),
    },
    /** Re-probe interval that lets the API return to live mode by itself. */
    healthIntervalMs: Math.max(5_000, asNum(process.env.DB_HEALTH_INTERVAL_MS, 30_000)),
    /** Connection log destination; empty string disables file logging. */
    logFile: process.env.DB_LOG_FILE ?? '',
  },

  // ── Auth (JWT + bcrypt + TOTP) ─────────────────────────────────────────────
  auth: {
    jwtSecret:        process.env.JWT_SECRET ?? 'dev_only_access_secret_change_me_0123456789abcdef',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev_only_refresh_secret_change_me_fedcba9876543210',
    accessExpires:    process.env.JWT_ACCESS_EXPIRES ?? '15m',
    refreshExpires:   process.env.JWT_REFRESH_EXPIRES ?? '7d',
    bcryptRounds:     asNum(process.env.BCRYPT_ROUNDS, 12),
    totpIssuer:       process.env.TOTP_ISSUER ?? 'MarinePlasticTracker',
    usingDefaultSecret: !process.env.JWT_SECRET,
  },

  // ── Satellite data source (Sentinel-2) ────────────────────────────────────
  satellite: {
    // cdse | sentinelhub | aws-stac | demo
    provider:       (process.env.SATELLITE_PROVIDER ?? 'demo').toLowerCase(),
    shClientId:     process.env.SENTINEL_HUB_CLIENT_ID ?? '',
    shClientSecret: process.env.SENTINEL_HUB_CLIENT_SECRET ?? '',
    shBaseUrl:      process.env.SENTINEL_HUB_BASE_URL ?? 'https://sh.dataspace.copernicus.eu',
    shTokenUrl:
      process.env.SENTINEL_HUB_TOKEN_URL ??
      'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
    // Zero-credential public catalogue (AWS Open Data — no key needed).
    awsStacUrl:     process.env.AWS_STAC_URL ?? 'https://earth-search.aws.element84.com/v1',
    // Legacy CDSE OData (account username/password).
    cdseUsername:   process.env.CDSE_USERNAME ?? '',
    cdsePassword:   process.env.CDSE_PASSWORD ?? '',
    cdseODataUrl:   process.env.CDSE_ODATA_URL ?? 'https://catalogue.dataspace.copernicus.eu/odata/v1',
  },
} as const;

export type Env = typeof env;
