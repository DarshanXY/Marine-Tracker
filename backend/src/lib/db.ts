/**
 * PostgreSQL connection layer.
 *
 * Owns everything between "the process started" and "queries are safe to run":
 *
 *   • an EXPLICIT pooled `$connect()` instead of Prisma's lazy connect-on-first-
 *     query, so the very first API request never pays the handshake and a bad
 *     credential/URL is discovered at boot rather than mid-request;
 *   • bounded exponential-backoff retry, because `start-all.cmd` launches the
 *     backend seconds after `pg_ctl start` and the cluster is often still in
 *     recovery — a single failed probe should not drop the API into demo mode;
 *   • DEFAULT_QUERIES — the standard read-only probes run on every connect;
 *   • a human-readable connection log appended to infra/logs/db-connection.log.
 *
 * The pool itself is configured in `env.ts` (it must be baked into the URL that
 * `prisma.ts` constructs the client with).
 */
import fs from 'fs';
import path from 'path';

import { prisma } from './prisma';
import { env, redactDatabaseUrl } from './env';
import { logger } from './logger';

// ── Result shapes ────────────────────────────────────────────────────────────

export interface ServerIdentity {
  version: string;
  serverVersion: string;
  database: string;
  user: string;
  host: string;
  port: number;
  startedAt: string;
}

export interface PoolActivity {
  maxConnections: number;
  openTotal: number;
  openThisApp: number;
  idleInTransaction: number;
}

export interface TableStat {
  name: string;
  /** Planner estimate — meaningless unless `analyzed` is true. */
  rows: number;
  /** False when statistics were never gathered (or were reset by a crash). */
  analyzed: boolean;
}

export interface DbConnectionInfo {
  connected: boolean;
  /** How many connect attempts it took (1 = first try). */
  attempts: number;
  /** Time to establish the pool. */
  connectMs: number | null;
  /** Round-trip time of `SELECT 1` once connected. */
  latencyMs: number | null;
  server: ServerIdentity | null;
  activity: PoolActivity | null;
  size: { bytes: number; pretty: string } | null;
  tables: TableStat[];
  extensions: string[];
  pool: typeof env.db.pool;
  target: string;
  error: string | null;
  at: string;
}

// ── Default queries ──────────────────────────────────────────────────────────
// The standard set every connect runs. All are read-only catalogue lookups —
// safe to run against a production cluster, and cheap enough to run on a timer.

export const DEFAULT_QUERIES = {
  /** Cheapest possible round-trip — measures pure link latency, nothing else. */
  ping: (): Promise<unknown> => prisma.$queryRaw`SELECT 1`,

  /** Who/what/where we are actually connected to. */
  identity: (): Promise<ServerIdentity[]> => prisma.$queryRaw<ServerIdentity[]>`
    SELECT version()                                       AS "version",
           current_setting('server_version')               AS "serverVersion",
           current_database()                              AS "database",
           current_user                                    AS "user",
           -- host() strips the /128 netmask that inet_server_addr() carries.
           COALESCE(host(inet_server_addr()), 'localhost') AS "host",
           COALESCE(inet_server_port(), 5432)              AS "port",
           to_char(pg_postmaster_start_time(), 'YYYY-MM-DD"T"HH24:MI:SSOF') AS "startedAt"
  `,

  /** Pool pressure: how close the cluster is to refusing new sockets. */
  activity: (appName: string): Promise<PoolActivity[]> => prisma.$queryRaw<PoolActivity[]>`
    SELECT (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS "maxConnections",
           (count(*))::int                                                        AS "openTotal",
           (count(*) FILTER (WHERE application_name = ${appName}))::int           AS "openThisApp",
           (count(*) FILTER (WHERE state = 'idle in transaction'))::int           AS "idleInTransaction"
    FROM pg_stat_activity
    WHERE datname = current_database()
  `,

  /** On-disk footprint of the database. */
  size: (): Promise<{ bytes: string; pretty: string }[]> =>
    prisma.$queryRaw<{ bytes: string; pretty: string }[]>`
      SELECT pg_database_size(current_database())::text            AS "bytes",
             pg_size_pretty(pg_database_size(current_database()))  AS "pretty"
    `,

  /**
   * Row count per table — a planner ESTIMATE, not a count(*), so the connect
   * path never pays for a sequential scan over `detections`.
   *
   * The estimate is maintained by autovacuum and is discarded when the stats
   * collector's file is lost, which is what a crash does: observed here after
   * the cluster aborted startup, where n_live_tup read 0 for a `detections`
   * table holding 63,009 rows. `analyzedAt` exposes that — a NULL means the
   * table has never been analysed since the reset and its number is worthless,
   * so the log can say so instead of reporting a confident zero.
   */
  tables: (): Promise<TableStat[]> => prisma.$queryRaw<TableStat[]>`
    SELECT relname::text   AS "name",
           n_live_tup::int AS "rows",
           GREATEST(last_analyze, last_autoanalyze) IS NOT NULL AS "analyzed"
    FROM pg_stat_user_tables
    ORDER BY n_live_tup DESC, relname ASC
  `,

  /** Installed extensions — the schema declares pgcrypto + unaccent. */
  extensions: (): Promise<{ name: string }[]> => prisma.$queryRaw<{ name: string }[]>`
    SELECT extname::text AS "name" FROM pg_extension ORDER BY extname
  `,
} as const;

// ── Connect with retry ───────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const message = (err: unknown): string =>
  err instanceof Error ? err.message.split('\n')[0]! : String(err);

/** Cached result of the most recent successful (or attempted) connect. */
let lastInfo: DbConnectionInfo | null = null;

export function lastConnectionInfo(): DbConnectionInfo | null {
  return lastInfo;
}

/**
 * Establish the pool and run the default probes.
 *
 * Never throws for connection failures — it returns `connected: false` with the
 * error captured, so the caller decides whether that is fatal (DATA_STRICT) or
 * just means "serve the demo dataset". Programmer errors still propagate.
 */
export async function connectDatabase(
  opts: { attempts?: number; deadlineMs?: number; silent?: boolean } = {},
): Promise<DbConnectionInfo> {
  const attemptsAllowed = opts.attempts ?? env.db.retry.attempts;
  const deadlineMs = opts.deadlineMs ?? env.db.retry.deadlineMs;
  const target = redactDatabaseUrl(env.db.rawUrl);
  const info: DbConnectionInfo = {
    connected: false,
    attempts: 0,
    connectMs: null,
    latencyMs: null,
    server: null,
    activity: null,
    size: null,
    tables: [],
    extensions: [],
    pool: env.db.pool,
    target,
    error: null,
    at: new Date().toISOString(),
  };

  if (!env.db.configured) {
    info.error = 'DATABASE_URL is not set.';
    lastInfo = info;
    return info;
  }

  const startedAt = Date.now();
  for (let attempt = 1; attempt <= attemptsAllowed; attempt++) {
    info.attempts = attempt;
    try {
      await prisma.$connect();
      const t0 = Date.now();
      await DEFAULT_QUERIES.ping();
      info.latencyMs = Date.now() - t0;
      info.connected = true;
      info.error = null;
      break;
    } catch (err) {
      info.error = message(err);
      if (attempt === attemptsAllowed) break;
      // Exponential backoff, capped — 400ms, 800ms, 1.6s, 3.2s, 5s…
      const wait = Math.min(env.db.retry.baseMs * 2 ** (attempt - 1), env.db.retry.maxMs);
      const elapsed = Date.now() - startedAt;
      if (elapsed + wait >= deadlineMs) {
        // Out of budget — stop here rather than stalling the boot further.
        if (!opts.silent) {
          logger.warn(
            `Database connect gave up after ${attempt} attempt(s) / ${elapsed}ms ` +
            `(budget ${deadlineMs}ms): ${info.error}`,
          );
        }
        break;
      }
      if (!opts.silent) {
        logger.warn(
          `Database connect attempt ${attempt}/${attemptsAllowed} failed (${info.error}) — retrying in ${wait}ms.`,
        );
      }
      await sleep(wait);
    }
  }

  // Elapsed wall-clock either way, so the log shows what a failure actually cost.
  info.connectMs = Date.now() - startedAt;

  if (info.connected) {
    // Best-effort enrichment: a catalogue query failing must not undo a
    // successful connection (a restricted role may not see pg_stat_activity).
    await Promise.all([
      DEFAULT_QUERIES.identity()
        .then(([row]) => { if (row) info.server = { ...row, port: Number(row.port) }; })
        .catch(() => undefined),
      DEFAULT_QUERIES.activity(env.db.pool.applicationName)
        .then(([row]) => { if (row) info.activity = row; })
        .catch(() => undefined),
      DEFAULT_QUERIES.size()
        .then(([row]) => { if (row) info.size = { bytes: Number(row.bytes), pretty: row.pretty }; })
        .catch(() => undefined),
      DEFAULT_QUERIES.tables()
        .then((rows) => { info.tables = rows; })
        .catch(() => undefined),
      DEFAULT_QUERIES.extensions()
        .then((rows) => { info.extensions = rows.map((r) => r.name); })
        .catch(() => undefined),
    ]);
  }

  info.at = new Date().toISOString();
  lastInfo = info;
  writeConnectionLog(info);
  return info;
}

/** Cheap liveness check for the health poll — no catalogue queries. */
export async function pingDatabase(): Promise<number | null> {
  const t0 = Date.now();
  try {
    await DEFAULT_QUERIES.ping();
    return Date.now() - t0;
  } catch {
    return null;
  }
}

// ── Connection log ───────────────────────────────────────────────────────────

/** Repo root = the nearest ancestor that contains an `infra` folder. */
function repoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'infra'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..', '..');
}

export function connectionLogPath(): string {
  return env.db.logFile
    ? path.resolve(env.db.logFile)
    : path.join(repoRoot(), 'infra', 'logs', 'db-connection.log');
}

/**
 * Render one connection event as the block that gets appended to the log.
 *
 * Deliberately ASCII-only: this file is read with `type` from cmd and
 * `Get-Content` from Windows PowerShell 5.1, both of which decode as the ANSI
 * codepage and turn box-drawing characters into mojibake.
 */
export function formatConnectionLog(info: DbConnectionInfo): string {
  const L: string[] = [];
  const rule = '='.repeat(78);
  L.push(rule);
  L.push(`[${info.at}]  DATABASE ${info.connected ? 'CONNECTED' : 'CONNECT FAILED'}`);
  L.push(rule);
  L.push(`  target            : ${info.target}`);
  L.push(`  attempts          : ${info.attempts}`);

  if (info.connected) {
    L.push(`  connect time      : ${info.connectMs} ms`);
    L.push(`  query latency     : ${info.latencyMs} ms  (SELECT 1)`);
    if (info.server) {
      L.push(`  server            : PostgreSQL ${info.server.serverVersion} @ ${info.server.host}:${info.server.port}`);
      L.push(`  database / user   : ${info.server.database} / ${info.server.user}`);
      L.push(`  postmaster up     : since ${info.server.startedAt}`);
    }
    L.push(
      `  pool              : limit=${info.pool.connectionLimit} ` +
      `pool_timeout=${info.pool.poolTimeoutS}s connect_timeout=${info.pool.connectTimeoutS}s ` +
      `application_name=${info.pool.applicationName}`,
    );
    if (info.activity) {
      L.push(
        `  cluster sockets   : ${info.activity.openTotal}/${info.activity.maxConnections} open ` +
        `(${info.activity.openThisApp} ours, ${info.activity.idleInTransaction} idle-in-transaction)`,
      );
    }
    if (info.size) L.push(`  database size     : ${info.size.pretty}`);
    if (info.extensions.length) L.push(`  extensions        : ${info.extensions.join(', ')}`);

    // Three states, deliberately kept distinct: has rows / known-empty /
    // unknown. Collapsing the third into "empty" is how a crash-reset stats
    // file turns 63,009 detections into a confident, wrong zero.
    const populated = info.tables.filter((t) => t.analyzed && t.rows > 0);
    const empty     = info.tables.filter((t) => t.analyzed && t.rows === 0);
    const unknown   = info.tables.filter((t) => !t.analyzed);

    L.push(
      `  tables            : ${info.tables.length} ` +
      `(${populated.length} populated, ${empty.length} empty, ${unknown.length} not analysed)`,
    );
    for (const t of populated) {
      L.push(`      ${t.name.padEnd(20)} ${String(t.rows).padStart(9)} rows (est.)`);
    }
    if (empty.length) L.push(`      (empty) ${empty.map((t) => t.name).join(', ')}`);
    if (unknown.length) {
      L.push(`      (row count UNKNOWN - never analysed, stats may have been reset by a crash;`);
      L.push('       run ANALYZE to refresh) ' + unknown.map((t) => t.name).join(', '));
    }
  } else {
    L.push(`  gave up after     : ${info.connectMs} ms`);
    L.push(`  error             : ${info.error}`);
    L.push('  hint              : start the local cluster with  infra\\start-db.cmd');
  }
  L.push('');
  return L.join('\n');
}

/**
 * Size cap before the log rolls over to `<name>.1`. One entry is written per
 * process start, and `tsx watch` restarts the backend on every file save — so
 * during a development session this file grows steadily and needs a bound.
 * Two generations is plenty: the log is a diagnostic, not an audit trail.
 */
const LOG_MAX_BYTES = 512 * 1024;

function rotateIfLarge(file: string): void {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return; // no file yet — nothing to rotate
  }
  if (size < LOG_MAX_BYTES) return;
  try {
    fs.rmSync(`${file}.1`, { force: true });
    fs.renameSync(file, `${file}.1`);
  } catch {
    // Rotation is opportunistic; a locked file just means we keep appending.
  }
}

/** Append the event to the connection log. Never throws — logging is best-effort. */
export function writeConnectionLog(info: DbConnectionInfo): void {
  if (env.db.logFile === '-') return; // explicitly disabled
  try {
    const file = connectionLogPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotateIfLarge(file);
    fs.appendFileSync(file, formatConnectionLog(info), 'utf8');
  } catch (err) {
    logger.debug(`Could not write the DB connection log: ${message(err)}`);
  }
}

/** One-line boot summary for stdout. */
export function summarize(info: DbConnectionInfo): string {
  if (!info.connected) return `Database unreachable after ${info.attempts} attempt(s): ${info.error}`;
  const analyzed = info.tables.filter((t) => t.analyzed);
  const rows = analyzed.reduce((n, t) => n + t.rows, 0);
  // Never print a row total that silently excludes un-analysed tables.
  const rowText = analyzed.length === info.tables.length
    ? `~${rows} rows`
    : `~${rows} rows in ${analyzed.length}/${info.tables.length} analysed tables`;
  const server = info.server ? `PostgreSQL ${info.server.serverVersion}` : 'PostgreSQL';
  return (
    `Connected to ${server} — ${info.server?.database ?? 'db'} ` +
    `(${info.tables.length} tables, ${rowText}, ${info.size?.pretty ?? 'size n/a'}) ` +
    `in ${info.connectMs}ms, latency ${info.latencyMs}ms, pool=${info.pool.connectionLimit}`
  );
}
