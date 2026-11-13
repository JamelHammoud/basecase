import { add, cross, dot, scale, sub, unit, type MeshIndex, type V3 } from './meshIndex';

export interface Cylinder {
  axis: V3;
  center: V3;
  radius: number;
  length: number;
  spanDeg: number;
  convex: boolean;
}

const COPLANAR_NORMALS = 0.1;
const FIT_ROUNDS = 3;

const residualLimit = (radius: number) => Math.max(0.05, radius * 0.02);

function jacobiRotate(m: number[][], v: number[][], [p, q]: [number, number]) {
  const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
  const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
  const c = 1 / Math.sqrt(t * t + 1);
  const s = t * c;

  for (let k = 0; k < 3; k++) {
    const mkp = m[k][p];
    const mkq = m[k][q];

    m[k][p] = c * mkp - s * mkq;
    m[k][q] = s * mkp + c * mkq;
  }

  for (let k = 0; k < 3; k++) {
    const mpk = m[p][k];
    const mqk = m[q][k];

    m[p][k] = c * mpk - s * mqk;
    m[q][k] = s * mpk + c * mqk;
  }

  for (let k = 0; k < 3; k++) {
    const vkp = v[k][p];
    const vkq = v[k][q];

    v[k][p] = c * vkp - s * vkq;
    v[k][q] = s * vkp + c * vkq;
  }
}

export function symmetricEigen(input: number[][]): Array<{ value: number; vector: V3 }> {
  const m = input.map((row) => [...row]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const pairs: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];

  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(m[0][1]) + Math.abs(m[0][2]) + Math.abs(m[1][2]);

    if (off < 1e-14) break;

    for (const pair of pairs) if (Math.abs(m[pair[0]][pair[1]]) > 1e-18) jacobiRotate(m, v, pair);
  }

  return [0, 1, 2]
    .map((k) => ({ value: m[k][k], vector: [v[0][k], v[1][k], v[2][k]] as V3 }))
    .sort((a, b) => a.value - b.value);
}

function normalMoments(index: MeshIndex, tris: number[]) {
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (const t of tris) {
    const n = index.normal(t);
    const w = index.areas[t];

    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += w * n[i] * n[j];
  }

  return m;
}

function planeBasis(axis: V3): [V3, V3] {
  const helper: V3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(axis, helper));

  return [u, cross(axis, u)];
}

function angularSpanDeg(index: MeshIndex, tris: number[], [u, w]: [V3, V3]) {
  const angles = tris.map((t) => Math.atan2(dot(index.normal(t), w), dot(index.normal(t), u))).sort((a, b) => a - b);
  let gap = angles[0] + 2 * Math.PI - angles[angles.length - 1];

  for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);

  return ((2 * Math.PI - gap) * 180) / Math.PI;
}

function solve3(a: number[][], b: number[]): number[] | null {
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(a);

  if (Math.abs(d) < 1e-12) return null;

  return [0, 1, 2].map((k) => det(a.map((row, i) => row.map((x, j) => (j === k ? b[i] : x)))) / d);
}

export function fitCircle(points: Array<[number, number]>): { cx: number; cy: number; r: number } | null {
  if (points.length < 3) return null;

  const mx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const my = points.reduce((s, p) => s + p[1], 0) / points.length;
  const a = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const b = [0, 0, 0];

  for (const [px, py] of points) {
    const x = px - mx;
    const y = py - my;
    const row = [x, y, 1];
    const rhs = -(x * x + y * y);

    for (let i = 0; i < 3; i++) {
      b[i] += row[i] * rhs;

      for (let j = 0; j < 3; j++) a[i][j] += row[i] * row[j];
    }
  }

  const s = solve3(a, b);

  if (!s) return null;

  const cx = -s[0] / 2;
  const cy = -s[1] / 2;
  const r2 = cx * cx + cy * cy - s[2];

  return r2 > 0 ? { cx: cx + mx, cy: cy + my, r: Math.sqrt(r2) } : null;
}

const cornersOf = (index: MeshIndex, tris: number[]) => [
  ...new Set(tris.flatMap((t) => [0, 1, 2].map((k) => index.corners[t * 3 + k]))),
];

interface Fit {
  cylinder: Cylinder;
  residual: (v: number) => number;
}

function fitOnce(index: MeshIndex, tris: number[], axis: V3): Fit | null {
  const basis = planeBasis(axis);
  const vertices = cornersOf(index, tris).map((v) => index.vertex(v));
  const circle = fitCircle(vertices.map((p) => [dot(p, basis[0]), dot(p, basis[1])]));

  if (!circle) return null;

  const along = vertices.map((p) => dot(p, axis));
  const lo = Math.min(...along);
  const hi = Math.max(...along);
  const onAxis = add(scale(basis[0], circle.cx), scale(basis[1], circle.cy));
  const center = add(onAxis, scale(axis, (lo + hi) / 2));
  const radialOf = (p: V3) => {
    const d = sub(p, onAxis);

    return sub(d, scale(axis, dot(d, axis)));
  };
  const outward = tris.reduce(
    (s, t) => s + index.areas[t] * dot(index.normal(t), unit(radialOf(centroid(index, t)))),
    0,
  );

  return {
    cylinder: {
      axis,
      center,
      radius: circle.r,
      length: hi - lo,
      spanDeg: angularSpanDeg(index, tris, basis),
      convex: outward > 0,
    },
    residual: (v) => Math.abs(Math.hypot(...radialOf(index.vertex(v))) - circle.r),
  };
}

function centroid(index: MeshIndex, t: number): V3 {
  const [a, b, c] = [0, 1, 2].map((k) => index.vertex(index.corners[t * 3 + k]));

  return scale(add(add(a, b), c), 1 / 3);
}

const triangleResidual = (index: MeshIndex, fit: Fit, t: number) =>
  Math.max(...[0, 1, 2].map((k) => fit.residual(index.corners[t * 3 + k])));

function rms(index: MeshIndex, fit: Fit, tris: number[]) {
  const vertices = cornersOf(index, tris);

  return Math.sqrt(vertices.reduce((s, v) => s + fit.residual(v) ** 2, 0) / vertices.length);
}

function cylinderAxis(index: MeshIndex, tris: number[]): V3 | null {
  const [least, middle] = symmetricEigen(normalMoments(index, tris));

  if (middle.value <= 0 || least.value > middle.value * COPLANAR_NORMALS) return null;

  return unit(least.vector);
}

export function fitCylinder(index: MeshIndex, region: number[], minSpanDeg: number): Cylinder | null {
  let tris = region;

  for (let round = 0; round < FIT_ROUNDS && tris.length >= 2; round++) {
    const axis = cylinderAxis(index, tris);
    const fit = axis && fitOnce(index, tris, axis);

    if (!fit) return null;

    const limit = residualLimit(fit.cylinder.radius);

    if (rms(index, fit, tris) <= limit) return fit.cylinder.spanDeg >= minSpanDeg ? fit.cylinder : null;

    const kept = tris.filter((t) => triangleResidual(index, fit, t) <= limit);

    if (kept.length === tris.length) return null;

    tris = kept;
  }

  return null;
}
