import * as THREE from 'three';

export interface Eigen3 {
  values: [number, number, number];
  vectors: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

const SWEEPS = 24;

function rotateJacobi(a: number[][], v: number[][], [p, q]: [number, number]) {
  if (Math.abs(a[p][q]) < 1e-18) return;

  const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
  const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
  const c = 1 / Math.sqrt(t * t + 1);
  const s = t * c;

  for (let k = 0; k < 3; k++) {
    const kp = a[k][p];
    const kq = a[k][q];

    a[k][p] = c * kp - s * kq;
    a[k][q] = s * kp + c * kq;
  }

  for (let k = 0; k < 3; k++) {
    const pk = a[p][k];
    const qk = a[q][k];

    a[p][k] = c * pk - s * qk;
    a[q][k] = s * pk + c * qk;
  }

  for (let k = 0; k < 3; k++) {
    const kp = v[k][p];
    const kq = v[k][q];

    v[k][p] = c * kp - s * kq;
    v[k][q] = s * kp + c * kq;
  }
}

export function symmetricEigen(m: ArrayLike<number>): Eigen3 {
  const a = [
    [m[0], m[1], m[2]],
    [m[1], m[3], m[4]],
    [m[2], m[4], m[5]],
  ];
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    if (Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]) < 1e-15) break;

    rotateJacobi(a, v, [0, 1]);
    rotateJacobi(a, v, [0, 2]);
    rotateJacobi(a, v, [1, 2]);
  }

  const order = [0, 1, 2].sort((i, j) => a[i][i] - a[j][j]);
  const column = (i: number) => new THREE.Vector3(v[0][i], v[1][i], v[2][i]);

  return {
    values: [a[order[0]][order[0]], a[order[1]][order[1]], a[order[2]][order[2]]],
    vectors: [column(order[0]), column(order[1]), column(order[2])],
  };
}

const N6 = 6;

function pivotRow(m: Float64Array, col: number) {
  let pivot = col;

  for (let r = col + 1; r < N6; r++) if (Math.abs(m[r * N6 + col]) > Math.abs(m[pivot * N6 + col])) pivot = r;

  return pivot;
}

function swapRows(m: Float64Array, x: Float64Array, [a, b]: [number, number]) {
  if (a === b) return;

  for (let k = 0; k < N6; k++) [m[a * N6 + k], m[b * N6 + k]] = [m[b * N6 + k], m[a * N6 + k]];

  [x[a], x[b]] = [x[b], x[a]];
}

function eliminateBelow(m: Float64Array, x: Float64Array, col: number) {
  for (let r = col + 1; r < N6; r++) {
    const f = m[r * N6 + col] / m[col * N6 + col];

    for (let k = col; k < N6; k++) m[r * N6 + k] -= f * m[col * N6 + k];

    x[r] -= f * x[col];
  }
}

export function solve6(h: ArrayLike<number>, g: ArrayLike<number>): Float64Array | null {
  const m = Float64Array.from(h);
  const x = Float64Array.from(g);

  for (let col = 0; col < N6; col++) {
    const pivot = pivotRow(m, col);

    if (Math.abs(m[pivot * N6 + col]) < 1e-14) return null;

    swapRows(m, x, [col, pivot]);
    eliminateBelow(m, x, col);
  }

  for (let r = N6 - 1; r >= 0; r--) {
    let sum = x[r];

    for (let k = r + 1; k < N6; k++) sum -= m[r * N6 + k] * x[k];

    x[r] = sum / m[r * N6 + r];
  }

  return x;
}

const axis = new THREE.Vector3();

export function twist(delta: ArrayLike<number>): THREE.Matrix4 {
  axis.set(delta[0], delta[1], delta[2]);

  const angle = axis.length();
  const out = angle > 1e-12 ? new THREE.Matrix4().makeRotationAxis(axis.normalize(), angle) : new THREE.Matrix4();

  return out.setPosition(delta[3], delta[4], delta[5]);
}

const q = new THREE.Quaternion();
const p = new THREE.Vector3();

export function untwist(m: THREE.Matrix4): number[] {
  m.decompose(p, q, s);

  const half = Math.acos(Math.min(1, Math.abs(q.w)));
  const sign = q.w < 0 ? -1 : 1;
  const scale = half > 1e-9 ? (2 * half) / Math.sin(half) : 2;

  return [q.x * scale * sign, q.y * scale * sign, q.z * scale * sign, p.x, p.y, p.z];
}

const s = new THREE.Vector3();

export function poseGap(a: THREE.Matrix4, b: THREE.Matrix4): { metres: number; radians: number } {
  const step = a.clone().invert().multiply(b);

  step.decompose(p, q, s);

  return { metres: p.length(), radians: 2 * Math.acos(Math.min(1, Math.abs(q.w))) };
}
