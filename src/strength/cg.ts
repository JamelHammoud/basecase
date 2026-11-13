export interface ElasticSystem {
  nodes: Int32Array;
  scale: Float64Array;
  stiffness: Float64Array;
  fixed: Uint8Array;
}

interface BlockMatrix {
  rowStart: Int32Array;
  cols: Int32Array;
  values: Float64Array;
}

const DOFS = 24;
const MAX_NEIGHBOURS = 27;

function addNeighbour(near: Int32Array, size: Int32Array, i: number, j: number): void {
  const row = near.subarray(i * MAX_NEIGHBOURS, i * MAX_NEIGHBOURS + size[i]);

  if (!row.includes(j)) near[i * MAX_NEIGHBOURS + size[i]++] = j;
}

function pattern(nodes: Int32Array, count: number): { rowStart: Int32Array; cols: Int32Array } {
  const near = new Int32Array(count * MAX_NEIGHBOURS);
  const size = new Int32Array(count);

  for (let e = 0; e < nodes.length; e += 8)
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) addNeighbour(near, size, nodes[e + a], nodes[e + b]);

  const rowStart = new Int32Array(count + 1);

  for (let i = 0; i < count; i++) rowStart[i + 1] = rowStart[i] + size[i];

  const cols = new Int32Array(rowStart[count]);

  for (let i = 0; i < count; i++)
    cols.set(near.subarray(i * MAX_NEIGHBOURS, i * MAX_NEIGHBOURS + size[i]).sort(), rowStart[i]);

  return { rowStart, cols };
}

function blockAt(m: Pick<BlockMatrix, 'rowStart' | 'cols'>, i: number, j: number): number {
  for (let k = m.rowStart[i]; k < m.rowStart[i + 1]; k++) if (m.cols[k] === j) return k;

  return -1;
}

function assemble(sys: ElasticSystem, count: number): BlockMatrix {
  const shape = pattern(sys.nodes, count);
  const values = new Float64Array(shape.cols.length * 9);
  const slots = new Int32Array(64);

  for (let e = 0; e < sys.scale.length; e++) {
    const own = sys.nodes.subarray(e * 8, e * 8 + 8);

    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) slots[a * 8 + b] = blockAt(shape, own[a], own[b]);

    for (let r = 0; r < DOFS; r++) {
      const s = sys.scale[e];

      for (let c = 0; c < DOFS; c++)
        values[slots[((r / 3) | 0) * 8 + ((c / 3) | 0)] * 9 + (r % 3) * 3 + (c % 3)] += s * sys.stiffness[r * DOFS + c];
    }
  }

  return { ...shape, values };
}

function pinBlock(m: BlockMatrix, fixed: Uint8Array, at: { i: number; k: number }): void {
  const j = m.cols[at.k];

  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const row = at.i * 3 + r;
      const col = j * 3 + c;

      if (fixed[row] || fixed[col]) m.values[at.k * 9 + r * 3 + c] = row === col ? 1 : 0;
    }
}

function pin(m: BlockMatrix, fixed: Uint8Array): void {
  for (let i = 0; i < m.rowStart.length - 1; i++)
    for (let k = m.rowStart[i]; k < m.rowStart[i + 1]; k++) pinBlock(m, fixed, { i, k });
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
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = a.subarray(at, at + 9);
  const c0 = m4 * m8 - m5 * m7;
  const c1 = m5 * m6 - m3 * m8;
  const c2 = m3 * m7 - m4 * m6;
  const det = m0 * c0 + m1 * c1 + m2 * c2 || 1e-30;

  out.set(
    [
      c0 / det,
      (m2 * m7 - m1 * m8) / det,
      (m1 * m5 - m2 * m4) / det,
      c1 / det,
      (m0 * m8 - m2 * m6) / det,
      (m2 * m3 - m0 * m5) / det,
      c2 / det,
      (m1 * m6 - m0 * m7) / det,
      (m0 * m4 - m1 * m3) / det,
    ],
    to,
  );
}

function blockJacobi(m: BlockMatrix): Float64Array {
  const count = m.rowStart.length - 1;
  const inv = new Float64Array(count * 9);

  for (let i = 0; i < count; i++) invert3(m.values, blockAt(m, i, i) * 9, inv, i * 9);

  return inv;
}

function precondition(inv: Float64Array, r: Float64Array, z: Float64Array): void {
  for (let i = 0; i < r.length; i += 3) {
    const v = i * 3;

    z[i] = inv[v] * r[i] + inv[v + 1] * r[i + 1] + inv[v + 2] * r[i + 2];
    z[i + 1] = inv[v + 3] * r[i] + inv[v + 4] * r[i + 1] + inv[v + 5] * r[i + 2];
    z[i + 2] = inv[v + 6] * r[i] + inv[v + 7] * r[i + 1] + inv[v + 8] * r[i + 2];
  }
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
  const m = assemble(sys, size / 3);

  pin(m, sys.fixed);

  const inv = blockJacobi(m);
  const u = new Float64Array(size);
  const r = f.map((v, i) => (sys.fixed[i] ? 0 : v));
  const z = new Float64Array(size);

  precondition(inv, r, z);

  const p = Float64Array.from(z);
  const q = new Float64Array(size);
  const norm0 = Math.sqrt(dot(r, r)) || 1;
  let rz = dot(r, z);
  let iterations = 0;
  let residual = 1;

  while (iterations < opts.maxIterations && residual > opts.tolerance) {
    multiplyBlocks(m, p, q);

    const alpha = rz / (dot(p, q) || 1e-30);

    for (let i = 0; i < size; i++) {
      u[i] += alpha * p[i];
      r[i] -= alpha * q[i];
    }

    precondition(inv, r, z);

    const next = dot(r, z);
    const beta = next / (rz || 1e-30);

    for (let i = 0; i < size; i++) p[i] = z[i] + beta * p[i];

    rz = next;
    iterations++;
    residual = Math.sqrt(dot(r, r)) / norm0;
  }

  return { u, iterations, residual };
}
