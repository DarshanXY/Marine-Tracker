import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class names safely, resolving conflicts via tailwind-merge. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a number with compact notation (1200 → "1.2K"). */
export function formatCompact(n: number): string {
  return Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** Format a coordinate pair for display. */
export function formatCoords(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lon).toFixed(4)}°${lonDir}`;
}

/** Format a detection footprint given in km² at a human scale.
 *  A single 10 m Sentinel-2 pixel is 0.0001 km² — rendering that as "0.00 km²"
 *  reads as zero, so small areas switch to m² / ha automatically. */
export function formatArea(km2: number): string {
  if (km2 >= 1) return `${km2.toFixed(2)} km²`;
  if (km2 >= 0.01) return `${(km2 * 100).toFixed(1)} ha`;
  return `${Math.round(km2 * 1_000_000).toLocaleString('en-IN')} m²`;
}

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Format a pipeline-stage duration for the live timeline. Stages time themselves
 *  with perf_counter and floor to whole ms, so a real-but-instant stage (nothing
 *  to process) reports 0 — which reads as "did nothing". Show "<1ms" instead, and
 *  roll up to seconds past 1000ms so the slow ingest stage stays legible. */
export function formatStageDuration(ms: number): string {
  if (ms <= 0) return '<1ms';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Returns true when the user has requested reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Human label for a drift forecast's forcing source. */
export function forcingLabel(source: string): string {
  if (source === 'cmems') return 'REAL CMEMS currents + winds';
  if (source === 'open-meteo') return 'REAL winds+currents';
  return source;
}
