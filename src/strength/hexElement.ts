export type Cell = [number, number, number];

export interface HexElement {
  stiffness: Float64Array;
  strains: Float64Array[];
}

const CORNER_SIGN = (a: number, axis: number) => (((a >> axis) & 1) === 1 ? 1 : -1);
const CORNER_POINTS: Cell[] = Array.from({ length: 8 }, (_, a) => [
  CORNER_SIGN(a, 0),
  CORNER_SIGN(a, 1),
  CORNER_SIGN(a, 2),
]);
const GAUSS = 1 / Math.sqrt(3);
const COMPATIBLE = 24;
const BUBBLES = 9;

export const SAMPLE_POINTS: Cell[] = Array.from({ length: 8 }, (_, a) => [
  CORNER_SIGN(a, 0) * GAUSS,
  CORNER_SIGN(a, 1) * GAUSS,
  CORNER_SIGN(a, 2) * GAUSS,
]);

function setColumn(b: Float64Array, cols: number, at: { col: number; dir: number; g: Cell }) {
  const { col, dir, g } = at;

  b[dir * cols + col] += g[dir];

  const shear: Array<[number, number, number]> = [
    [3, 1, 2],
    [4, 0, 2],
    [5, 0, 1],
  ];

  for (const [row, i, j] of shear) {
    if (dir === i) b[row * cols + col] += g[j];

    if (dir === j) b[row * cols + col] += g[i];
  }
}

function compatibleGradient(a: number, p: Cell, h: Cell): Cell {
  const s = [0, 1, 2].map((k) => CORNER_SIGN(a, k));
  const f = [0, 1, 2].map((k) => 1 + s[k] * p[k]);

  return [
    (s[0] * f[1] * f[2] * 2) / (8 * h[0]),
    (f[0] * s[1] * f[2] * 2) / (8 * h[1]),
    (f[0] * f[1] * s[2] * 2) / (8 * h[2]),
  ];
}

function bubbleGradient(mode: number, p: Cell, h: Cell): Cell {
  const g: Cell = [0, 0, 0];

  g[mode] = (-2 * p[mode] * 2) / h[mode];

  return g;
}

function strainMatrices(p: Cell, h: Cell) {
  const bc = new Float64Array(6 * COMPATIBLE);
  const bi = new Float64Array(6 * BUBBLES);

  for (let a = 0; a < 8; a++) {
    const g = compatibleGradient(a, p, h);

    for (let dir = 0; dir < 3; dir++) setColumn(bc, COMPATIBLE, { col: a * 3 + dir, dir, g });
  }

  for (let mode = 0; mode < 3; mode++) {
    const g = bubbleGradient(mode, p, h);

    for (let dir = 0; dir < 3; dir++) setColumn(bi, BUBBLES, { col: mode * 3 + dir, dir, g });
  }

  return { bc, bi };
}

function addProduct(
  out: Float64Array,
  m: { left: Float64Array; lc: number; right: Float64Array; rc: number },
  c: Float64Array,
  w: number,
) {
  const { left, lc, right, rc } = m;
  const cb = new Float64Array(6 * rc);

  for (let r = 0; r < 6; r++)
    for (let k = 0; k < 6; k++) {
      const ck = c[r * 6 + k] * w;

      for (let j = 0; j < rc; j++) cb[r * rc + j] += ck * right[k * rc + j];
    }

  for (let i = 0; i < lc; i++)
    for (let r = 0; r < 6; r++) {
      const lri = left[r * lc + i];

      for (let j = 0; j < rc; j++) out[i * rc + j] += lri * cb[r * rc + j];
    }
}

function solveSymmetric(a: Float64Array, n: number, rhs: Float64Array, cols: number): Float64Array {
  const m = Float64Array.from(a);
  const x = Float64Array.from(rhs);

  for (let k = 0; k < n; k++) {
    const pivot = m[k * n + k];

    for (let i = k + 1; i < n; i++) {
      const f = m[i * n + k] / pivot;

      for (let j = k; j < n; j++) m[i * n + j] -= f * m[k * n + j];

      for (let j = 0; j < cols; j++) x[i * cols + j] -= f * x[k * cols + j];
    }
  }

  for (let k = n - 1; k >= 0; k--) {
    for (let j = 0; j < cols; j++) {
      let v = x[k * cols + j];

      for (let i = k + 1; i < n; i++) v -= m[k * n + i] * x[i * cols + j];

      x[k * cols + j] = v / m[k * n + k];
    }
  }

  return x;
}

export function hexElement(h: Cell, c: Float64Array): HexElement {
  const w = (h[0] * h[1] * h[2]) / 8;
  const kcc = new Float64Array(COMPATIBLE * COMPATIBLE);
  const kic = new Float64Array(BUBBLES * COMPATIBLE);
  const kii = new Float64Array(BUBBLES * BUBBLES);
  const mats = SAMPLE_POINTS.map((p) => strainMatrices(p, h));

  for (const { bc, bi } of mats) {
    addProduct(kcc, { left: bc, lc: COMPATIBLE, right: bc, rc: COMPATIBLE }, c, w);
    addProduct(kic, { left: bi, lc: BUBBLES, right: bc, rc: COMPATIBLE }, c, w);
    addProduct(kii, { left: bi, lc: BUBBLES, right: bi, rc: BUBBLES }, c, w);
  }

  const condense = solveSymmetric(kii, BUBBLES, kic, COMPATIBLE).map((v) => -v);
  const stiffness = Float64Array.from(kcc);

  for (let i = 0; i < COMPATIBLE; i++)
    for (let m = 0; m < BUBBLES; m++) {
      const kim = kic[m * COMPATIBLE + i];

      for (let j = 0; j < COMPATIBLE; j++) stiffness[i * COMPATIBLE + j] += kim * condense[m * COMPATIBLE + j];
    }

  const strains = CORNER_POINTS.map((p) => strainMatrices(p, h)).map(({ bc, bi }) => {
    const b = Float64Array.from(bc);

    for (let r = 0; r < 6; r++)
      for (let m = 0; m < BUBBLES; m++) {
        const v = bi[r * BUBBLES + m];

        for (let j = 0; j < COMPATIBLE; j++) b[r * COMPATIBLE + j] += v * condense[m * COMPATIBLE + j];
      }

    return b;
  });

  return { stiffness, strains };
}
