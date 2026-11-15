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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function interpolator(values: Float32Array, { origin, step, size }: Grid): (p: Vec3) => number {
  const [ox, oy, oz] = origin;
  const [nx, ny, nz] = size;
  const layer = nx * ny;

  return (p) => {
    const x = (p[0] - ox) / step;
    const y = (p[1] - oy) / step;
    const z = (p[2] - oz) / step;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const k = Math.floor(z);

    if (i < 0 || i >= nx - 1 || j < 0 || j >= ny - 1 || k < 0 || k >= nz - 1) return -1;

    const tx = x - i;
    const ty = y - j;
    const tz = z - k;
    const at = (k * ny + j) * nx + i;
    const above = at + layer;
    const x00 = lerp(values[at], values[at + 1], tx);
    const x10 = lerp(values[at + nx], values[at + nx + 1], tx);
    const x01 = lerp(values[above], values[above + 1], tx);
    const x11 = lerp(values[above + nx], values[above + nx + 1], tx);

    return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz);
  };
}

export function smoothField(test: PointTest, box: Box, step: number): ((p: Vec3) => number) | null {
  const origin = box.min.map((v) => v - step * (1 + GRID_OFFSET)) as Vec3;
  const size = box.max.map((v, a) => Math.ceil((v - origin[a]) / step) + 3) as Vec3;
  const grid: Grid = { origin, step, size };
  const filled = sample(test, grid);

  if (!filled.includes(1)) return null;

  const values = blurred(dilated(filled, grid), grid);

  return interpolator(values, grid);
}
