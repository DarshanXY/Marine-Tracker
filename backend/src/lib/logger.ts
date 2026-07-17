/**
 * Tiny level-aware logger (no dependency). Honours LOG_LEVEL from env.
 */
import { env } from './env';

const LEVELS = ['error', 'warn', 'info', 'debug'] as const;
type Level = (typeof LEVELS)[number];

const configured = LEVELS.indexOf(env.logLevel as Level);
const threshold = configured === -1 ? LEVELS.indexOf('info') : configured;

function emit(level: Level, msg: string, meta?: unknown): void {
  if (LEVELS.indexOf(level) > threshold) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${msg}`;
  if (level === 'error') console.error(line, meta ?? '');
  else if (level === 'warn') console.warn(line, meta ?? '');
  else console.log(line, meta ?? '');
}

export const logger = {
  error: (msg: string, meta?: unknown): void => emit('error', msg, meta),
  warn:  (msg: string, meta?: unknown): void => emit('warn', msg, meta),
  info:  (msg: string, meta?: unknown): void => emit('info', msg, meta),
  debug: (msg: string, meta?: unknown): void => emit('debug', msg, meta),
};
