import type { Box, Vec3 } from 'manifold-3d';

export type PointTest = (x: number, y: number, z: number) => boolean;

const GRID_OFFSET = 0.37;
const NEIGHBOURS: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

interface Grid {
  origin: Vec3;
  step: number;
  size: Vec3;
}

const indexOf = ({ size }: Grid, i: number, j: number, k: number) => (k * size[1] + j) * size[0] + i;

function eachInner({ size }: Grid, visit: (i: number, j: number, k: number) => void): void {
  for (let k = 1; k < size[2] - 1; k++) {
    for (let j = 1; j < size[1] - 1; j++) {
      for (let i = 1; i < size[0] - 1; i++) visit(i, j, k);
    }
  }
}

function sample(test: PointTest, grid: Grid): Uint8Array {
  const { origin, step, size } = grid;
  const filled = new Uint8Array(size[0] * size[1] * size[2]);

  eachInner(grid, (i, j, k) => {
    filled[indexOf(grid, i, j, k)] = test(origin[0] + i * step, origin[1] + j * step, origin[2] + k * step) ? 1 : 0;
  });

  return filled;
}

function dilated(filled: Uint8Array, grid: Grid): Uint8Array {
  const out = filled.slice();

  eachInner(grid, (i, j, k) => {
    const at = indexOf(grid, i, j, k);

    if (!filled[at]) out[at] = NEIGHBOURS.some(([a, b, c]) => filled[indexOf(grid, i + a, j + b, k + c)]) ? 1 : 0;
  });

  return out;
}

function blurred(filled: Uint8Array, grid: Grid): Float32Array {
  const out = new Float32Array(filled.length).fill(-1);

  eachInner(grid, (i, j, k) => {
    let sum = filled[indexOf(grid, i, j, k)] * 2 - 1;

    for (const [a, b, c] of NEIGHBOURS) sum += filled[indexOf(grid, i + a, j + b, k + c)] * 2 - 1;

    out[indexOf(grid, i, j, k)] = sum / 7;
  });

  return out;
}

function interpolate(values: Float32Array, grid: Grid, p: Vec3): number {
  const { origin, step, size } = grid;
  const f = [0, 1, 2].map((a) => (p[a] - origin[a]) / step);
  const base = f.map(Math.floor);

  if (base.some((b, a) => b < 0 || b >= size[a] - 1)) return -1;

  const [tx, ty, tz] = f.map((v, a) => v - base[a]);
  const at = (a: number, b: number, c: number) => values[indexOf(grid, base[0] + a, base[1] + b, base[2] + c)];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const x00 = lerp(at(0, 0, 0), at(1, 0, 0), tx);
  const x10 = lerp(at(0, 1, 0), at(1, 1, 0), tx);
  const x01 = lerp(at(0, 0, 1), at(1, 0, 1), tx);
  const x11 = lerp(at(0, 1, 1), at(1, 1, 1), tx);

  return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz);
}

export function smoothField(test: PointTest, box: Box, step: number): ((p: Vec3) => number) | null {
  const origin = box.min.map((v) => v - step * (1 + GRID_OFFSET)) as Vec3;
  const size = box.max.map((v, a) => Math.ceil((v - origin[a]) / step) + 3) as Vec3;
  const grid: Grid = { origin, step, size };
  const filled = sample(test, grid);

  if (!filled.includes(1)) return null;

  const values = blurred(dilated(filled, grid), grid);

  return (p) => interpolate(values, grid, p);
}
