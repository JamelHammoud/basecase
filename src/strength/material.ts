import type { PrintMaterial } from '../types/robotics';

export type V3 = [number, number, number];

export interface LayeredMaterial {
  inPlaneMpa: number;
  acrossMpa: number;
  shearMpa: number;
  inPlaneE: number;
  acrossE: number;
  shearG: number;
  poisson: number;
}

export const LAYERED: Partial<Record<PrintMaterial, LayeredMaterial>> = {
  PLA: { inPlaneMpa: 50, acrossMpa: 25, shearMpa: 25, inPlaneE: 3200, acrossE: 2700, shearG: 1100, poisson: 0.35 },
  PETG: { inPlaneMpa: 45, acrossMpa: 30, shearMpa: 28, inPlaneE: 2000, acrossE: 1800, shearG: 700, poisson: 0.38 },
  ABS: { inPlaneMpa: 36, acrossMpa: 20, shearMpa: 20, inPlaneE: 2100, acrossE: 1800, shearG: 750, poisson: 0.35 },
  ASA: { inPlaneMpa: 38, acrossMpa: 22, shearMpa: 22, inPlaneE: 2100, acrossE: 1800, shearG: 750, poisson: 0.35 },
};

export interface PrintFill {
  infill: number;
  shellMm: number;
}

const LINE_MM = 0.42;
const SKIN_MM = 0.8;
const WALLS = 2;

export const printFill = (infillPct: number): PrintFill => ({
  infill: Math.min(1, Math.max(0, infillPct / 100)),
  shellMm: Math.max(SKIN_MM, WALLS * LINE_MM),
});

export function stressShare(depth: number, cellMm: number, fill: PrintFill): number {
  if (depth > 0) return solidShare(depth, cellMm, fill);

  const hollow = 1 - Math.min(1, fill.shellMm / cellMm);

  return 1 - hollow ** 3 * (1 - fill.infill);
}

export function solidShare(depth: number, cellMm: number, fill: PrintFill): number {
  const shell = Math.min(1, Math.max(0, fill.shellMm / cellMm - depth));

  return shell + (1 - shell) * fill.infill;
}

type Mat3 = number[][];

const unit = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1;

  return [v[0] / l, v[1] / l, v[2] / l];
};

export function layerFrame(normal: V3): Mat3 {
  const n = unit(normal);
  const helper: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const t1 = unit([
    helper[1] * n[2] - helper[2] * n[1],
    helper[2] * n[0] - helper[0] * n[2],
    helper[0] * n[1] - helper[1] * n[0],
  ]);
  const t2: V3 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];

  return [t1, t2, n];
}

const VOIGT: Array<[number, number]> = [
  [0, 0],
  [1, 1],
  [2, 2],
  [1, 2],
  [0, 2],
  [0, 1],
];

function invert(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);

  for (let col = 0; col < n; col++) {
    const pivot = a.reduce((best, row, r) => (r >= col && Math.abs(row[col]) > Math.abs(a[best][col]) ? r : best), col);

    [a[col], a[pivot]] = [a[pivot], a[col]];

    const p = a[col][col];

    a[col] = a[col].map((v) => v / p);

    for (let r = 0; r < n; r++) {
      if (r === col) continue;

      const f = a[r][col];

      a[r] = a[r].map((v, k) => v - f * a[col][k]);
    }
  }

  return a.map((row) => row.slice(n));
}

function localStiffness(m: LayeredMaterial): number[][] {
  const { inPlaneE: ep, acrossE: en, shearG: g, poisson: nu } = m;
  const s = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));

  s[0][0] = 1 / ep;
  s[1][1] = 1 / ep;
  s[2][2] = 1 / en;
  s[0][1] = s[1][0] = -nu / ep;
  s[0][2] = s[2][0] = s[1][2] = s[2][1] = -nu / ep;
  s[3][3] = 1 / g;
  s[4][4] = 1 / g;
  s[5][5] = (2 * (1 + nu)) / ep;

  return invert(s);
}

function bondMatrix(q: Mat3): number[][] {
  const a = (i: number, j: number) => q[j][i];

  return VOIGT.map(([i, j]) =>
    VOIGT.map(([k, l]) => (k === l ? a(i, k) * a(j, l) : a(i, k) * a(j, l) + a(i, l) * a(j, k))),
  );
}

const bilinear = (bond: number[][], local: number[][], r: number, c: number) =>
  bond[r].reduce((sum, brk, k) => sum + brk * local[k].reduce((acc, v, l) => acc + v * bond[c][l], 0), 0);

export function stiffnessFor(m: LayeredMaterial, normal: V3): Float64Array {
  const local = localStiffness(m);
  const bond = bondMatrix(layerFrame(normal));
  const out = new Float64Array(36);

  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) out[r * 6 + c] = bilinear(bond, local, r, c);

  return out;
}

export function failureIndex(s: ArrayLike<number>, normal: V3, m: LayeredMaterial): number {
  const [n0, n1, n2] = normal;
  const t0 = s[0] * n0 + s[5] * n1 + s[4] * n2;
  const t1 = s[5] * n0 + s[1] * n1 + s[3] * n2;
  const t2 = s[4] * n0 + s[3] * n1 + s[2] * n2;
  const across = t0 * n0 + t1 * n1 + t2 * n2;
  const shear2 = Math.max(0, t0 * t0 + t1 * t1 + t2 * t2 - across * across);
  const trace = s[0] + s[1] + s[2] - across;
  const frob =
    s[0] * s[0] + s[1] * s[1] + s[2] * s[2] + 2 * (s[3] * s[3] + s[4] * s[4] + s[5] * s[5]) - 2 * shear2 - across ** 2;
  const vm2 = Math.max(0, (3 * frob - trace * trace) / 2);
  const pull = across > 0 ? across / m.acrossMpa : across / m.inPlaneMpa;

  return vm2 / m.inPlaneMpa ** 2 + pull * pull + shear2 / m.shearMpa ** 2;
}
