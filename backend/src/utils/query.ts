/** Small helpers to safely coerce Express query/param values. */

export const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

export const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export const clampInt = (v: unknown, def: number, min: number, max: number): number => {
  const n = parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
};

export const bool = (v: unknown): boolean | undefined => {
  if (v === undefined) return undefined;
  const s = String(v).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return undefined;
};

export const upper = (v: unknown): string | undefined => {
  const s = str(v);
  return s ? s.toUpperCase() : undefined;
};
