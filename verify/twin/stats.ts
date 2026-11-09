import type { Rng } from '../zoo/rng';

export function rms(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;

  for (let i = 0; i < n; i++) sum += (a[i] - b[i]) ** 2;

  return Math.sqrt(sum / Math.max(n, 1));
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;

  if (!sorted.length) return Number.NaN;

  return sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const BOOTSTRAP = Object.freeze({ resamples: 10_000, alpha: 0.05 });

export function bootstrapMedianLower(values: number[], rng: Rng): number {
  const medians: number[] = [];

  for (let b = 0; b < BOOTSTRAP.resamples; b++) {
    const sample = values.map(() => values[Math.floor(rng() * values.length) % values.length]);

    medians.push(median(sample));
  }

  medians.sort((a, b) => a - b);

  return medians[Math.floor((BOOTSTRAP.alpha / 2) * BOOTSTRAP.resamples)];
}
