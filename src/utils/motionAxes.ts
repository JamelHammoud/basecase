import * as THREE from 'three';

export type Vec = [number, number, number];

export interface TurnAxis {
  axis: Vec;
  coords: number[];
  span: number;
}

export interface BoneTurns {
  mean: THREE.Quaternion;
  axes: TurnAxis[];
}

const MEAN_STEPS = 4;
const SWEEPS = 50;

export function turnVector(q: THREE.Quaternion): Vec {
  const s = q.w < 0 ? -1 : 1;
  const [x, y, z, w] = [q.x * s, q.y * s, q.z * s, q.w * s];
  const n = Math.hypot(x, y, z);

  if (n < 1e-12) return [2 * x, 2 * y, 2 * z];

  const angle = 2 * Math.atan2(n, w);

  return [(x / n) * angle, (y / n) * angle, (z / n) * angle];
}

export function turnOf(v: Vec): THREE.Quaternion {
  const angle = Math.hypot(...v);

  if (angle < 1e-12) return new THREE.Quaternion();

  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...v).divideScalar(angle), angle);
}

const meanOf = (vs: Vec[]): Vec =>
  [0, 1, 2].map((k) => vs.reduce((s, v) => s + v[k], 0) / Math.max(1, vs.length)) as Vec;

export function meanTurn(qs: THREE.Quaternion[]): THREE.Quaternion {
  const ref = qs[0] ?? new THREE.Quaternion();
  const sum = new THREE.Quaternion(0, 0, 0, 0);

  for (const q of qs) {
    const s = q.dot(ref) < 0 ? -1 : 1;

    sum.set(sum.x + q.x * s, sum.y + q.y * s, sum.z + q.z * s, sum.w + q.w * s);
  }

  let mean = sum.length() > 1e-9 ? sum.normalize() : ref.clone();

  for (let i = 0; i < MEAN_STEPS; i++) {
    const inv = mean.clone().invert();
    const step = meanOf(qs.map((q) => turnVector(inv.clone().multiply(q))));

    mean = mean.clone().multiply(turnOf(step)).normalize();
  }

  return mean;
}

function rotate(a: number[][], v: number[][], [p, q]: [number, number]) {
  const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
  const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
  const c = 1 / Math.sqrt(t * t + 1);
  const s = t * c;

  for (let k = 0; k < 3; k++) {
    const [akp, akq] = [a[k][p], a[k][q]];

    a[k][p] = c * akp - s * akq;
    a[k][q] = s * akp + c * akq;
  }

  for (let k = 0; k < 3; k++) {
    const [apk, aqk] = [a[p][k], a[q][k]];

    a[p][k] = c * apk - s * aqk;
    a[q][k] = s * apk + c * aqk;
  }

  for (let k = 0; k < 3; k++) {
    const [vkp, vkq] = [v[k][p], v[k][q]];

    v[k][p] = c * vkp - s * vkq;
    v[k][q] = s * vkp + c * vkq;
  }
}

const PAIRS: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [1, 2],
];

export function symmetricEigen(m: number[][]): Vec[] {
  const a = m.map((row) => [...row]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    const off = PAIRS.reduce((s, [p, q]) => s + a[p][q] ** 2, 0);

    if (off < 1e-24) break;

    for (const pair of PAIRS) if (Math.abs(a[pair[0]][pair[1]]) > 1e-30) rotate(a, v, pair);
  }

  return [0, 1, 2].map((k) => [v[0][k], v[1][k], v[2][k]] as Vec);
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function covariance(vs: Vec[]): number[][] {
  const mean = meanOf(vs);
  const c = [0, 1, 2].map(() => [0, 0, 0]);

  for (const v of vs)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i][j] += (v[i] - mean[i]) * (v[j] - mean[j]);

  return c.map((row) => row.map((x) => x / Math.max(1, vs.length)));
}

export function boneTurns(qs: THREE.Quaternion[]): BoneTurns {
  const mean = meanTurn(qs);
  const inv = mean.clone().invert();
  const vs = qs.map((q) => turnVector(inv.clone().multiply(q)));
  const axes = symmetricEigen(covariance(vs)).map((axis) => {
    const coords = vs.map((v) => dot(v, axis));

    return { axis, coords, span: Math.max(...coords) - Math.min(...coords) };
  });

  return { mean, axes: axes.sort((a, b) => b.span - a.span) };
}
