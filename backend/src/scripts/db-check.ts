/**
 * `npm run db:check` — connect to PostgreSQL, run the default probe queries,
 * print the result, and append it to the connection log.
 *
 * Standalone counterpart to what the API does at boot: same module, same pool
 * settings, same log file — so "is the database actually up and does it hold
 * what I think it holds?" is answerable without starting the whole stack.
 *
 * Exit code 0 = connected, 1 = not connected (usable from a script / CI gate).
 */
import { prisma } from '../lib/prisma';
import { env } from '../lib/env';
import { connectDatabase, connectionLogPath, formatConnectionLog } from '../lib/db';

async function main(): Promise<void> {
  if (!env.db.configured) {
    console.error('DATABASE_URL is not set — nothing to connect to.');
    process.exitCode = 1;
    return;
  }

  const info = await connectDatabase();
  // The log block already renders everything worth showing; reuse it verbatim so
  // the console and the file can never drift apart.
  process.stdout.write(`\n${formatConnectionLog(info)}`);
  console.log(`  → appended to ${connectionLogPath()}\n`);
  process.exitCode = info.connected ? 0 : 1;
}

main()
  .catch((err) => {
    console.error('db:check failed:', err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
