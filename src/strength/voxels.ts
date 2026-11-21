import type { Cell } from './hexElement';
import type { V3 } from './material';
import { voxelNeighbours } from './voxelNeighbours';

export interface VoxelGrid {
  origin: V3;
  h: Cell;
  n: Cell;
  solid: Uint8Array;
}

export const CELL_MM = 1.5;

const MAX_SOLID = 9000;
const MAX_BOX_CELLS = 1_500_000;
const JITTER_Y = 0.000137;
const JITTER_Z = 0.000291;

function bounds(tris: ArrayLike<number>) {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < tris.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], tris[i + k]);
      max[k] = Math.max(max[k], tris[i + k]);
    }

  return { min, max };
}

function gridFor(min: V3, max: V3, cellMm: number) {
  const n = [0, 1, 2].map((k) => Math.max(1, Math.round((max[k] - min[k]) / cellMm))) as Cell;
  const h = [0, 1, 2].map((k) => Math.max(1e-6, (max[k] - min[k]) / n[k])) as Cell;

  return { n, h };
}

interface Row {
  hits: number[];
}

type Grid = { origin: V3; h: Cell; n: Cell };

const centerOf = (grid: Grid, axis: 1 | 2, index: number) =>
  grid.origin[axis] + (index + 0.5 + (axis === 1 ? JITTER_Y : JITTER_Z)) * grid.h[axis];

function centerIndex(grid: Grid, axis: 1 | 2, value: number): number {
  const jitter = axis === 1 ? JITTER_Y : JITTER_Z;

  return (value - grid.origin[axis]) / grid.h[axis] - 0.5 - jitter;
}

function triangleHits(rows: Row[], tris: ArrayLike<number>, offset: number, grid: Grid) {
  const ax = tris[offset];
  const ay = tris[offset + 1];
  const az = tris[offset + 2];
  const bx = tris[offset + 3];
  const by = tris[offset + 4];
  const bz = tris[offset + 5];
  const qx = tris[offset + 6];
  const qy = tris[offset + 7];
  const qz = tris[offset + 8];
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const aqx = qx - ax;
  const aqy = qy - ay;
  const aqz = qz - az;
  const det = aby * aqz - aqy * abz;

  if (Math.abs(det) < 1e-12) return;

  const j0 = Math.max(0, Math.ceil(centerIndex(grid, 1, Math.min(ay, by, qy))));
  const j1 = Math.min(grid.n[1] - 1, Math.floor(centerIndex(grid, 1, Math.max(ay, by, qy))));
  const k0 = Math.max(0, Math.ceil(centerIndex(grid, 2, Math.min(az, bz, qz))));
  const k1 = Math.min(grid.n[2] - 1, Math.floor(centerIndex(grid, 2, Math.max(az, bz, qz))));

  for (let k = k0; k <= k1; k++) {
    const pz = centerOf(grid, 2, k) - az;

    for (let j = j0; j <= j1; j++) {
      const py = centerOf(grid, 1, j) - ay;
      const u = (py * aqz - aqy * pz) / det;
      const v = (aby * pz - py * abz) / det;

      if (u >= 0 && v >= 0 && u + v <= 1) rows[k * grid.n[1] + j].hits.push(ax + u * abx + v * aqx);
    }
  }
}

function rowHits(tris: ArrayLike<number>, grid: Grid): Row[] {
  const rows: Row[] = Array.from({ length: grid.n[1] * grid.n[2] }, () => ({ hits: [] }));

  for (let t = 0; t < tris.length; t += 9) triangleHits(rows, tris, t, grid);

  return rows;
}

function fill(rows: Row[], grid: { origin: V3; h: Cell; n: Cell }): Uint8Array {
  const { origin, h, n } = grid;
  const solid = new Uint8Array(n[0] * n[1] * n[2]);

  rows.forEach((row, r) => {
    const xs = row.hits.sort((a, b) => a - b);

    for (let p = 0; p + 1 < xs.length; p += 2) {
      const i0 = Math.max(0, Math.ceil((xs[p] - origin[0]) / h[0] - 0.5));
      const i1 = Math.min(n[0] - 1, Math.floor((xs[p + 1] - origin[0]) / h[0] - 0.5));

      for (let i = i0; i <= i1; i++) solid[r * n[0] + i] = 1;
    }
  });

  return solid;
}

export function voxelizeAt(tris: ArrayLike<number>, cellMm: number): VoxelGrid {
  const { min, max } = bounds(tris);
  const { n, h } = gridFor(min, max, cellMm);
  const grid = { origin: min, h, n };

  return { ...grid, solid: fill(rowHits(tris, grid), grid) };
}

const countSolid = (g: VoxelGrid) => g.solid.reduce((s, v) => s + v, 0);

export function voxelize(tris: ArrayLike<number>, cellMm = CELL_MM): VoxelGrid {
  const { min, max } = bounds(tris);
  const box = (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]);
  const start = Math.max(cellMm, Math.cbrt(box / MAX_BOX_CELLS));
  const first = voxelizeAt(tris, start);
  const solid = countSolid(first);

  return solid <= MAX_SOLID ? first : voxelizeAt(tris, start * Math.cbrt(solid / MAX_SOLID) * 1.02);
}

export const cellIndex = (g: Pick<VoxelGrid, 'n'>, i: number, j: number, k: number) => (k * g.n[1] + j) * g.n[0] + i;

const isEdge = (g: VoxelGrid, c: number, neighbours: (cell: number) => number[]) => {
  const near = neighbours(c);

  return near.length < 6 || near.some((m) => !g.solid[m]);
};

interface DepthTraversal {
  grid: VoxelGrid;
  depth: Int32Array;
  neighbours: (cell: number) => number[];
}

function appendDepth({ grid, depth, neighbours }: DepthTraversal, frontier: number[], next: number[]): void {
  for (const c of frontier) {
    for (const m of neighbours(c)) {
      if (!grid.solid[m] || depth[m] >= 0) continue;

      depth[m] = depth[c] + 1;
      next.push(m);
    }
  }
}

export function surfaceDepth(g: VoxelGrid): Int32Array {
  const depth = new Int32Array(g.solid.length).fill(-1);
  const neighbours = voxelNeighbours(g);
  let frontier: number[] = [];
  let next: number[] = [];

  for (let c = 0; c < g.solid.length; c++) {
    if (!g.solid[c] || !isEdge(g, c, neighbours)) continue;

    depth[c] = 0;
    frontier.push(c);
  }

  const traversal = { grid: g, depth, neighbours };

  while (frontier.length) {
    next.length = 0;

    appendDepth(traversal, frontier, next);

    const previous = frontier;

    frontier = next;
    next = previous;
  }

  return depth;
}
