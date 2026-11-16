import { assembleElastic, blockAt, type BlockMatrix, type ElasticPattern } from './elasticPattern';

export interface ElasticSystem {
  pattern: ElasticPattern;
  scale: Float64Array;
  stiffness: Float64Array;
  fixed: Uint8Array;
}

function pinBlock(m: BlockMatrix, fixed: Uint8Array, i: number, k: number): void {
  const j = m.cols[k];

  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const row = i * 3 + r;
      const col = j * 3 + c;

      if (fixed[row] || fixed[col]) m.values[k * 9 + r * 3 + c] = row === col ? 1 : 0;
    }
}

function pin(m: BlockMatrix, fixed: Uint8Array): void {
  for (let i = 0; i < m.rowStart.length - 1; i++)
    for (let k = m.rowStart[i]; k < m.rowStart[i + 1]; k++) pinBlock(m, fixed, i, k);
}

export function multiplyBlocks(m: BlockMatrix, x: Float64Array, y: Float64Array): void {
  const { rowStart, cols, values } = m;

  for (let i = 0; i < rowStart.length - 1; i++) {
    let y0 = 0;
    let y1 = 0;
    let y2 = 0;

    for (let k = rowStart[i]; k < rowStart[i + 1]; k++) {
      const j = cols[k] * 3;
      const v = k * 9;
      const x0 = x[j];
      const x1 = x[j + 1];
      const x2 = x[j + 2];

      y0 += values[v] * x0 + values[v + 1] * x1 + values[v + 2] * x2;
      y1 += values[v + 3] * x0 + values[v + 4] * x1 + values[v + 5] * x2;
      y2 += values[v + 6] * x0 + values[v + 7] * x1 + values[v + 8] * x2;
    }

    y[i * 3] = y0;
    y[i * 3 + 1] = y1;
    y[i * 3 + 2] = y2;
  }
}

function invert3(a: Float64Array, at: number, out: Float64Array, to: number): void {
  const m0 = a[at];
  const m1 = a[at + 1];
  const m2 = a[at + 2];
  const m3 = a[at + 3];
  const m4 = a[at + 4];
  const m5 = a[at + 5];
  const m6 = a[at + 6];
  const m7 = a[at + 7];
  const m8 = a[at + 8];
  const c0 = m4 * m8 - m5 * m7;
  const c1 = m5 * m6 - m3 * m8;
  const c2 = m3 * m7 - m4 * m6;
  const det = m0 * c0 + m1 * c1 + m2 * c2 || 1e-30;

  out[to] = c0 / det;
  out[to + 1] = (m2 * m7 - m1 * m8) / det;
  out[to + 2] = (m1 * m5 - m2 * m4) / det;
  out[to + 3] = c1 / det;
  out[to + 4] = (m0 * m8 - m2 * m6) / det;
  out[to + 5] = (m2 * m3 - m0 * m5) / det;
  out[to + 6] = c2 / det;
  out[to + 7] = (m1 * m6 - m0 * m7) / det;
  out[to + 8] = (m0 * m4 - m1 * m3) / det;
}

function blockJacobi(m: BlockMatrix): Float64Array {
  const count = m.rowStart.length - 1;
  const inv = new Float64Array(count * 9);

  for (let i = 0; i < count; i++) invert3(m.values, blockAt(m, i, i) * 9, inv, i * 9);

  return inv;
}

function precondition(inv: Float64Array, r: Float64Array, z: Float64Array): number {
  let product = 0;

  for (let i = 0; i < r.length; i += 3) {
    const v = i * 3;

    z[i] = inv[v] * r[i] + inv[v + 1] * r[i + 1] + inv[v + 2] * r[i + 2];
    z[i + 1] = inv[v + 3] * r[i] + inv[v + 4] * r[i + 1] + inv[v + 5] * r[i + 2];
    z[i + 2] = inv[v + 6] * r[i] + inv[v + 7] * r[i + 1] + inv[v + 8] * r[i + 2];
    product += r[i] * z[i];
    product += r[i + 1] * z[i + 1];
    product += r[i + 2] * z[i + 2];
  }

  return product;
}

const dot = (a: Float64Array, b: Float64Array) => {
  let s = 0;

  for (let i = 0; i < a.length; i++) s += a[i] * b[i];

  return s;
};

export interface CgResult {
  u: Float64Array;
  iterations: number;
  residual: number;
}

export function conjugateGradient(
  sys: ElasticSystem,
  f: Float64Array,
  opts: { tolerance: number; maxIterations: number },
): CgResult {
  const size = f.length;
  const m = assembleElastic(sys.pattern, sys.scale, sys.stiffness);

  pin(m, sys.fixed);

  const inv = blockJacobi(m);
  const u = new Float64Array(size);
  const r = f.map((v, i) => (sys.fixed[i] ? 0 : v));
  const z = new Float64Array(size);

  let rz = precondition(inv, r, z);

  const p = Float64Array.from(z);
  const q = new Float64Array(size);
  const norm0 = Math.sqrt(dot(r, r)) || 1;
  let iterations = 0;
  let residual = 1;

  while (iterations < opts.maxIterations && residual > opts.tolerance) {
    multiplyBlocks(m, p, q);

    const alpha = rz / (dot(p, q) || 1e-30);
    let norm2 = 0;

    for (let i = 0; i < size; i++) {
      u[i] += alpha * p[i];
      r[i] -= alpha * q[i];
      norm2 += r[i] * r[i];
    }

    iterations++;
    residual = Math.sqrt(norm2) / norm0;

    const keepGoing = iterations < opts.maxIterations && residual > opts.tolerance;

    if (!keepGoing) break;

    const next = precondition(inv, r, z);
    const beta = next / (rz || 1e-30);

    for (let i = 0; i < size; i++) p[i] = z[i] + beta * p[i];

    rz = next;
  }

  return { u, iterations, residual };
}
