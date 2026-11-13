import type { Vec3 } from './vec3';

export interface Eigen3 {
  values: number[];
  vectors: Vec3[];
}

const PAIRS: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 2],
];

const MAX_SWEEPS = 32;
const TOLERANCE = 1e-28;

const offDiagonal = (a: number[]) => 2 * (a[1] * a[1] + a[2] * a[2] + a[5] * a[5]);

function rotateColumns(m: number[], at: { p: number; q: number; c: number; s: number }): void {
  for (let k = 0; k < 3; k++) {
    const kp = m[k * 3 + at.p];
    const kq = m[k * 3 + at.q];

    m[k * 3 + at.p] = at.c * kp - at.s * kq;
    m[k * 3 + at.q] = at.s * kp + at.c * kq;
  }
}

function rotateRows(m: number[], at: { p: number; q: number; c: number; s: number }): void {
  for (let k = 0; k < 3; k++) {
    const pk = m[at.p * 3 + k];
    const qk = m[at.q * 3 + k];

    m[at.p * 3 + k] = at.c * pk - at.s * qk;
    m[at.q * 3 + k] = at.s * pk + at.c * qk;
  }
}

function annihilate(a: number[], v: number[], [p, q]: [number, number]): void {
  const apq = a[p * 3 + q];

  if (apq === 0) return;

  const theta = (a[q * 3 + q] - a[p * 3 + p]) / (2 * apq);
  const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
  const c = 1 / Math.sqrt(t * t + 1);
  const at = { p, q, c, s: t * c };

  rotateColumns(a, at);
  rotateRows(a, at);
  rotateColumns(v, at);
}

export function symmetricEigen(matrix: ArrayLike<number>): Eigen3 {
  const a = Array.from(matrix);
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const scale = a.reduce((sum, value) => sum + value * value, 0);

  for (let sweep = 0; sweep < MAX_SWEEPS && offDiagonal(a) > TOLERANCE * scale; sweep++) {
    for (const pair of PAIRS) annihilate(a, v, pair);
  }

  const order = [0, 1, 2].sort((i, j) => a[i * 4] - a[j * 4]);

  return {
    values: order.map((i) => a[i * 4]),
    vectors: order.map((i): Vec3 => [v[i], v[3 + i], v[6 + i]]),
  };
}
