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

function normalizers(pairs: PointPair[]): { from: Similarity; to: Similarity } {
  let fromX = 0;
  let fromY = 0;
  let toX = 0;
  let toY = 0;

  for (const { from, to } of pairs) {
    fromX += from[0];
    fromY += from[1];
    toX += to[0];
    toY += to[1];
  }

  fromX /= pairs.length;
  fromY /= pairs.length;
  toX /= pairs.length;
  toY /= pairs.length;

  let fromSpread = 0;
  let toSpread = 0;

  for (const { from, to } of pairs) {
    fromSpread += Math.hypot(from[0] - fromX, from[1] - fromY);
    toSpread += Math.hypot(to[0] - toX, to[1] - toY);
  }

  fromSpread /= pairs.length;
  toSpread /= pairs.length;

  return {
    from: { scale: fromSpread > 0 ? Math.SQRT2 / fromSpread : 1, cx: fromX, cy: fromY },
    to: { scale: toSpread > 0 ? Math.SQRT2 / toSpread : 1, cx: toX, cy: toY },
  };
}

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

function normalEquations(pairs: PointPair[], nFrom: Similarity, nTo: Similarity) {
  const ata = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const atb = new Array<number>(8).fill(0);
  const horizontal = [0, 0, 1, 0, 0, 0, 0, 0];
  const vertical = [0, 0, 0, 0, 0, 1, 0, 0];
  const add = (row: number[], value: number) => {
    for (let r = 0; r < 8; r++) {
      atb[r] += row[r] * value;

      for (let c = r; c < 8; c++) ata[r][c] += row[r] * row[c];
    }
  };

  for (const { from, to } of pairs) {
    const x = (from[0] - nFrom.cx) * nFrom.scale;
    const y = (from[1] - nFrom.cy) * nFrom.scale;
    const u = (to[0] - nTo.cx) * nTo.scale;
    const v = (to[1] - nTo.cy) * nTo.scale;

    horizontal[0] = x;
    horizontal[1] = y;
    horizontal[6] = -u * x;
    horizontal[7] = -u * y;
    vertical[3] = x;
    vertical[4] = y;
    vertical[6] = -v * x;
    vertical[7] = -v * y;
    add(horizontal, u);
    add(vertical, v);
  }

  for (let r = 0; r < 8; r++) for (let c = 0; c < r; c++) ata[r][c] = ata[c][r];

  return { ata, atb };
}

export function fitHomography(pairs: PointPair[]): Mat3 | null {
  if (pairs.length < MIN_PAIRS) return null;

  const { from: nFrom, to: nTo } = normalizers(pairs);
  const { ata, atb } = normalEquations(pairs, nFrom, nTo);
  const h = solveLinear(ata, atb);

  if (!h || h.some((v) => !Number.isFinite(v))) return null;

  return multiply(unsimilarity(nTo), multiply([...h, 1], similarity(nFrom)));
}
