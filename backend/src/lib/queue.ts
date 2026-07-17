/**
 * BullMQ pipeline queue — the architecture's Node→Python decoupling layer.
 *
 * API requests and cron ticks ENQUEUE jobs and return immediately; a BullMQ
 * worker in this process executes them (engine HTTP call + PostgreSQL persist)
 * with retries and exponential backoff. Redis is probed lazily and cached:
 * when it's down, callers get `queueAvailable() === false` and fall back to
 * the direct synchronous path — the queue is an upgrade, never a requirement.
 *
 * Start the local portable Redis with:  infra\start-redis.cmd
 */
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';
import { logger } from './logger';
import { publishLive } from './live';
import { runOnEngine, type RunJobData } from './engine';
import { persistRun, type EngineResult, type PersistSummary } from '../services/pipelinePersist.service';

export const QUEUE_NAME = 'pipeline-runs';
/** Repeatable "sweep" job: fans out one run per monitored region. */
export const SWEEP_JOB = 'scheduled-sweep';

export interface RunJobResult {
  stats: Record<string, unknown>;
  persisted: PersistSummary | null;
  generatedAt: string;
}

/** BullMQ gets plain options (it manages its own connections; passing our
 *  ioredis instance trips dual-package type conflicts). */
function redisOptions() {
  const u = new URL(env.redisUrl);
  return {
    host: u.hostname || 'localhost',
    port: Number(u.port) || 6379,
    ...(u.password ? { password: u.password } : {}),
    maxRetriesPerRequest: null as null, // required by BullMQ
    // NOTE: offline queue stays ENABLED — the worker's blocking connection
    // must buffer commands across Redis restarts to reconnect cleanly. Fast
    // failure detection is the probe's job (queueAvailable), not this client's.
    connectTimeout: 3_000,
  };
}

let queue: Queue | null = null;
let worker: Worker | null = null;

let lastProbe = 0;
let healthy = false;
const PROBE_TTL_MS = 30_000;

/** Probe Redis (cached 30 s) — routes use this to pick queue vs direct path.
 *  Uses a throwaway connection that WAITS for connect (a persistent client with
 *  enableOfflineQueue=false throws instantly while still connecting — a startup
 *  race that falsely reported the queue as down). */
export async function queueAvailable(): Promise<boolean> {
  const now = Date.now();
  if (now - lastProbe < PROBE_TTL_MS) return healthy;
  lastProbe = now;
  const probe = new IORedis(env.redisUrl, {
    lazyConnect: true,
    connectTimeout: 2_000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // one shot — no background retry spam
  });
  probe.on('error', () => { /* reported via the catch below */ });
  try {
    await probe.connect();
    const pong = await Promise.race([
      probe.ping(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2_000)),
    ]);
    healthy = pong === 'PONG';
  } catch {
    healthy = false;
  } finally {
    probe.disconnect();
  }
  return healthy;
}

function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: redisOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return queue;
}

/** The worker — engine call + persistence, sequential (the engine is one process). */
export function startWorker(): void {
  if (worker) return;
  worker = new Worker(
    QUEUE_NAME,
    async (job: Job): Promise<RunJobResult> => {
      // The repeatable sweep fans out one run per region, then returns.
      if (job.name === SWEEP_JOB) {
        const enqueued = await sweepRegions();
        return { stats: { sweep: true, enqueued }, persisted: null, generatedAt: new Date().toISOString() };
      }
      const data = (await runOnEngine(job.data as RunJobData)) as EngineResult & {
        stats: Record<string, unknown>;
      };
      let persisted: PersistSummary | null = null;
      try {
        persisted = await persistRun(data);
      } catch (err) {
        logger.warn(`queued run persisted=false: ${(err as Error).message}`);
      }
      return { stats: data.stats ?? {}, persisted, generatedAt: data.generatedAt };
    },
    { connection: redisOptions(), concurrency: 1 },
  );
  worker.on('error', () => { /* Redis-down churn — routes fall back; worker reconnects */ });
  worker.on('completed', (job) => {
    logger.info(`queue: job ${job.id} (${job.name}) completed`);
    publishLive({ type: 'job', id: String(job.id), name: job.name, state: 'completed' });
  });
  worker.on('failed', (job, err) => {
    logger.warn(`queue: job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
    publishLive({ type: 'job', id: String(job?.id), name: job?.name ?? '?', state: 'failed', attempt: job?.attemptsMade });
  });
  logger.info(`BullMQ worker listening on "${QUEUE_NAME}" (${env.redisUrl})`);
}

/** Enqueue one pipeline run. Caller must have checked queueAvailable(). */
export async function enqueueRun(name: string, data: RunJobData): Promise<string> {
  const job = await getQueue().add(name, data);
  return String(job.id);
}

/** Fan out one queued run per monitored region (driven by the repeatable sweep). */
async function sweepRegions(): Promise<number> {
  let codes: string[] = [];
  try {
    const { prisma } = await import('./prisma');
    codes = (await prisma.region.findMany({ select: { code: true } })).map((r) => r.code);
  } catch (err) {
    logger.warn(`sweep: could not list regions: ${(err as Error).message}`);
    return 0;
  }
  for (const code of codes) {
    await getQueue().add('region', { region: code } as RunJobData);
  }
  logger.info(`scheduler: swept ${codes.length} region(s) → queued`);
  return codes.length;
}

/** Start the internal repeatable sweep — true continuous real-time scanning with
 *  no external OS cron. Idempotent: BullMQ keys the repeatable by name+interval,
 *  so a restart re-attaches instead of stacking duplicates. No-op unless
 *  SCHEDULER_ENABLED and Redis is reachable. */
export async function startScheduler(): Promise<void> {
  if (!env.scheduler.enabled) return;
  if (!(await queueAvailable())) {
    logger.warn('scheduler: Redis unavailable — continuous scanning not started (run infra\\start-redis.cmd).');
    return;
  }
  try {
    await getQueue().add(SWEEP_JOB, {}, {
      repeat: { every: env.scheduler.intervalMs },
      removeOnComplete: true,
      removeOnFail: true,
    });
    logger.info(`scheduler: continuous scanning every ${Math.round(env.scheduler.intervalMs / 60_000)} min`);
  } catch (err) {
    logger.warn(`scheduler: failed to register sweep: ${(err as Error).message}`);
  }
}

/** Job status for the polling endpoint. */
export async function jobStatus(id: string): Promise<Record<string, unknown> | null> {
  const job = await getQueue().getJob(id);
  if (!job) return null;
  const state = await job.getState();
  return {
    id: String(job.id),
    name: job.name,
    state,
    attemptsMade: job.attemptsMade,
    data: job.data,
    result: state === 'completed' ? job.returnvalue : null,
    failedReason: job.failedReason ?? null,
    enqueuedAt: new Date(job.timestamp).toISOString(),
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
  };
}

/** Queue depth summary for /api/pipeline/status. */
export async function queueCounts(): Promise<Record<string, number> | null> {
  if (!(await queueAvailable())) return null;
  const c = await getQueue().getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return c as Record<string, number>;
}

export async function closeQueue(): Promise<void> {
  await worker?.close();
  await queue?.close();
}
