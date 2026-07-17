/**
 * Python-engine HTTP client — one place for the fetch + timeout + error shape,
 * shared by the API routes (synchronous runs) and the BullMQ worker (queued runs).
 */
import { env } from './env';

export async function callEngine(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.pythonEngineUrl}${path}`, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`engine responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export interface RunJobData {
  region?: string;
  bbox?: { north: number; south: number; east: number; west: number };
  sceneSize?: number;
}

/** Run the detection pipeline on the engine (region or AOI). */
export async function runOnEngine(data: RunJobData, timeoutMs = 120_000): Promise<unknown> {
  const body = data.bbox
    ? { bbox: data.bbox, sceneSize: data.sceneSize ?? 64 }
    : { region: data.region, sceneSize: data.sceneSize ?? 64 };
  return callEngine('/pipeline/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs);
}
