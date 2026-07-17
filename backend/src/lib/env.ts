/**
 * Zero-dependency environment loader + typed config.
 *
 * Reads `.env` from the backend folder and the repo root WITHOUT requiring the
 * `dotenv` package — this keeps the ₹0 / low-friction setup (one less install).
 * Shell-provided variables always win; values in .env files never overwrite
 * anything already present in `process.env`.
 */
import fs from 'fs';
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
