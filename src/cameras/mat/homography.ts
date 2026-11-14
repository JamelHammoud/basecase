import { solveLinear } from '../../reality/leastSquares';

export type Pt = [number, number];
export type Mat3 = number[];

export interface PointPair {
  from: Pt;
  to: Pt;
}

const MIN_PAIRS = 4;

interface Similarity {
  scale: number;
  cx: number;
  cy: number;
}

function normalizer(points: Pt[]): Similarity {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  const spread = points.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / points.length;

  return { scale: spread > 0 ? Math.SQRT2 / spread : 1, cx, cy };
}

const toNormal = (n: Similarity, p: Pt): Pt => [(p[0] - n.cx) * n.scale, (p[1] - n.cy) * n.scale];

const similarity = (n: Similarity): Mat3 => [n.scale, 0, -n.cx * n.scale, 0, n.scale, -n.cy * n.scale, 0, 0, 1];

const unsimilarity = (n: Similarity): Mat3 => [1 / n.scale, 0, n.cx, 0, 1 / n.scale, n.cy, 0, 0, 1];

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9).fill(0);

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  }

  return out;
}

export function invert(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;

  if (Math.abs(det) < 1e-18) return null;

  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
}

export function apply(m: Mat3, [x, y]: Pt): Pt {
  const w = m[6] * x + m[7] * y + m[8];

  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

function normalEquations(pairs: PointPair[]): { ata: number[][]; atb: number[] } {
  const ata = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const atb = new Array<number>(8).fill(0);
  const add = (row: number[], value: number) => {
    for (let r = 0; r < 8; r++) {
      atb[r] += row[r] * value;

      for (let c = 0; c < 8; c++) ata[r][c] += row[r] * row[c];
    }
  };

  for (const { from, to } of pairs) {
    const [x, y] = from;
    const [u, v] = to;

    add([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    add([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }

  return { ata, atb };
}

export function fitHomography(pairs: PointPair[]): Mat3 | null {
  if (pairs.length < MIN_PAIRS) return null;

  const nFrom = normalizer(pairs.map((p) => p.from));
  const nTo = normalizer(pairs.map((p) => p.to));
  const normal = pairs.map((p) => ({ from: toNormal(nFrom, p.from), to: toNormal(nTo, p.to) }));
  const { ata, atb } = normalEquations(normal);
  const h = solveLinear(ata, atb);

  if (!h || h.some((v) => !Number.isFinite(v))) return null;

  return multiply(unsimilarity(nTo), multiply([...h, 1], similarity(nFrom)));
}
