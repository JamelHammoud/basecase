import type { Random } from './seededRandom';

export type Matrix = number[][];

export function cholesky(matrix: Matrix, jitter = 1e-12): Matrix | null {
  const n = matrix.length;
  const lower: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i][j] + (i === j ? jitter : 0);

      for (let k = 0; k < j; k++) sum -= lower[i][k] * lower[j][k];

      lower[i][j] = i === j ? Math.sqrt(sum) : sum / lower[j][j];
    }

    if (Number.isNaN(lower[i][i]) || lower[i][i] <= 0) return null;
  }

  return lower;
}

export function mahalanobis(lower: Matrix, offset: readonly number[]): number {
  const solved: number[] = [];

  for (let i = 0; i < offset.length; i++) {
    let sum = offset[i];

    for (let k = 0; k < i; k++) sum -= lower[i][k] * solved[k];

    solved.push(sum / lower[i][i]);
  }

  return solved.reduce((s, v) => s + v * v, 0);
}

export function standardNormal(random: Random): number {
  const u = Math.max(random(), Number.MIN_VALUE);

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

export function correlatedNormal(lower: Matrix, random: Random, clip: number): number[] {
  const z = lower.map(() => Math.max(-clip, Math.min(clip, standardNormal(random))));

  return lower.map((row) => row.reduce((s, v, k) => s + v * z[k], 0));
}

const NORMAL_QUANTILE: Record<number, number> = { 0.5: 0, 0.9: 1.2815515655446004, 0.95: 1.6448536269514722 };

export function chiSquareQuantile(dof: number, level: number): number {
  const z = NORMAL_QUANTILE[level];

  if (z === undefined) throw new Error(`No normal quantile for ${level}`);

  const k = 2 / (9 * dof);

  return dof * (1 - k + z * Math.sqrt(k)) ** 3;
}

export const transformed = (a: Matrix, covariance: Matrix): Matrix =>
  a.map((ai) => a.map((aj) => ai.reduce((s, x, p) => s + x * aj.reduce((t, y, q) => t + covariance[p][q] * y, 0), 0)));
