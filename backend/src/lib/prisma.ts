/**
 * Prisma client singleton.
 *
 * One shared instance for the whole process so hot-reloads (tsx watch) don't
 * exhaust the Postgres connection pool. Importing `env` first guarantees the
 * .env files are loaded before PrismaClient reads DATABASE_URL, and lets us hand
 * Prisma the POOL-TUNED url (connection_limit / pool_timeout / connect_timeout /
 * application_name) instead of the bare one from .env — see `env.db.pool`.
 *
 * Connecting, retrying and logging live in `./db`; this module only constructs
 * the client so that `db.ts` can import it without a cycle.
 */
import { PrismaClient } from '@prisma/client';
import { env } from './env';

export const prisma = new PrismaClient({
  log: env.isDev ? ['error', 'warn'] : ['error'],
  // Only override when a URL is actually configured — passing an empty string
  // would mask Prisma's own "DATABASE_URL is missing" diagnostic.
  ...(env.db.url ? { datasources: { db: { url: env.db.url } } } : {}),
});
