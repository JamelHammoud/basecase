import { frozenQuery } from './lightenFrozen';
import type { LightenFrozen } from './lightenTypes';
import { cellCenter, type HexMesh } from './mesh';
import type { V3 } from './types';
import { cellIndex } from './voxels';
import { gridMass, type LightenMassTarget } from './lightenMass';
import { interfacePaths } from './lightenPaths';
import { fineGrid, type FineGrid } from './lightenFineGrid';

export type { FineGrid } from './lightenFineGrid';

function ballOffsets(h: V3, radius: number): V3[] {
  const reach = h.map((value) => Math.ceil(radius / value));
  const offsets: V3[] = [];

  for (let k = -reach[2]; k <= reach[2]; k++)
    for (let j = -reach[1]; j <= reach[1]; j++) for (let i = -reach[0]; i <= reach[0]; i++) offsets.push([i, j, k]);

  return offsets.filter(([i, j, k]) => Math.hypot(i * h[0], j * h[1], k * h[2]) <= radius);
}

function offsetCell(grid: FineGrid, cell: number, offset: V3): number {
  const [nx, ny, nz] = grid.n;
  const i = (cell % nx) + offset[0];
  const j = (Math.floor(cell / nx) % ny) + offset[1];
  const k = Math.floor(cell / (nx * ny)) + offset[2];

  if (i < 0 || i >= nx || j < 0 || j >= ny || k < 0 || k >= nz) return -1;

  return (k * ny + j) * nx + i;
}

function openedGrid(options: {
  mesh: HexMesh;
  ranked: number[];
  count: number;
  offsets: V3[];
  paths: Uint8Array;
}): FineGrid {
  const { mesh, ranked, count, offsets, paths } = options;
  const grid = fineGrid(mesh, ranked, count, paths);
  const expanded = grid.solid.map((_, cell) =>
    offsets.some((offset) => grid.solid[offsetCell(grid, cell, offset)] === 1) ? 1 : 0,
  );
  const eroded = expanded.map((value, cell) =>
    value && offsets.every((offset) => expanded[offsetCell(grid, cell, offset)] === 1) ? 1 : 0,
  );
  const solid = eroded.map((_, cell) =>
    offsets.some((offset) => eroded[offsetCell(grid, cell, offset)] === 1) ? 1 : 0,
  );

  return { ...grid, solid };
}

export function sampleDensityGrid(grid: FineGrid, p: V3): number {
  const x = (p[0] - grid.origin[0]) / grid.h[0] - 0.5;
  const y = (p[1] - grid.origin[1]) / grid.h[1] - 0.5;
  const z = (p[2] - grid.origin[2]) / grid.h[2] - 0.5;
  const i = Math.floor(x);
  const j = Math.floor(y);
  const k = Math.floor(z);
  const tx = x - i;
  const ty = y - j;
  const tz = z - k;
  let sum = 0;

  for (let corner = 0; corner < 8; corner++) {
    const a = i + (corner & 1);
    const b = j + ((corner >> 1) & 1);
    const c = k + ((corner >> 2) & 1);
    const weight = (corner & 1 ? tx : 1 - tx) * (corner & 2 ? ty : 1 - ty) * (corner & 4 ? tz : 1 - tz);
    const inside = a >= 0 && a < grid.n[0] && b >= 0 && b < grid.n[1] && c >= 0 && c < grid.n[2];
    const value = inside ? grid.solid[cellIndex(grid, a, b, c)] : 0;

    sum += weight * (value * 2 - 1);
  }

  return sum;
}

export function targetDensityGrid(options: {
  mesh: HexMesh;
  density: Float64Array;
  minWallMm: number;
  regions: LightenFrozen;
  massTarget: LightenMassTarget;
}): FineGrid {
  const { mesh, density, minWallMm, regions, massTarget } = options;
  const ranked = Array.from(density, (value, e) => ({ value, e }))
    .sort((a, b) => b.value - a.value || a.e - b.e)
    .map(({ e }) => e);
  const paths = interfacePaths(mesh, density, regions);
  const template = fineGrid(mesh, ranked, ranked.length, paths);
  const offsets = ballOffsets(template.h, minWallMm / 2 + Math.max(...template.h) / 2);
  const isFrozen = frozenQuery(regions);
  const frozen = template.solid.map((_, cell) => (isFrozen(cellCenter(template, cell)) ? 1 : 0));
  const original = template.solid;
  let low = 0;
  let high = ranked.length;
  let chosen = openedGrid({ mesh, ranked, count: 0, offsets, paths });

  for (let step = 0; step < 10; step++) {
    const count = Math.floor((low + high) / 2);
    const grid = openedGrid({ mesh, ranked, count, offsets, paths });
    const mask = grid.solid.map((value, cell) => (original[cell] && (value || frozen[cell]) ? 1 : 0));
    const grams = gridMass(grid, mask, massTarget);

    if (grams > massTarget.originalGrams * massTarget.share) high = count;
    else {
      low = count;
      chosen = grid;
    }
  }

  return chosen;
}
