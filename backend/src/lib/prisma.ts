/**
 * Prisma client singleton.
 *
 * One shared instance for the whole process so hot-reloads (tsx watch) don't
 * exhaust the Postgres connection pool. Importing `env` first guarantees the
 * .env files are loaded before PrismaClient reads DATABASE_URL.
 */
import { PrismaClient } from '@prisma/client';
import { env } from './env';

export const prisma = new PrismaClient({
  log: env.isDev ? ['error', 'warn'] : ['error'],
});
