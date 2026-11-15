import { frozenAt } from './lightenFrozen';
import type { LightenFrozen } from './lightenTypes';
import { cellCenter, type HexMesh } from './mesh';
import type { V3 } from './types';
import { cellIndex } from './voxels';
import { gridMass, type LightenMassTarget } from './lightenMass';
import { interfacePaths } from './lightenPaths';

export interface FineGrid {
  origin: V3;
  n: V3;
  h: V3;
  solid: Uint8Array;
}

function fineGrid(mesh: HexMesh, ranked: number[], count: number, paths: Uint8Array): FineGrid {
  const { grid } = mesh;
  const n = grid.n.map((value) => value * 2) as V3;
  const h = grid.h.map((value) => value / 2) as V3;
  const solid = new Uint8Array(n[0] * n[1] * n[2]);
  const kept = new Set(ranked.slice(0, count).map((e) => mesh.cells[e]));

  for (let k = 0; k < n[2]; k++)
    for (let j = 0; j < n[1]; j++)
      for (let i = 0; i < n[0]; i++)
        solid[cellIndex({ n }, i, j, k)] =
          kept.has(cellIndex(grid, i >> 1, j >> 1, k >> 1)) || paths[cellIndex(grid, i >> 1, j >> 1, k >> 1)] ? 1 : 0;

  return { origin: grid.origin, n, h, solid };
}

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
  const f = p.map((value, axis) => (value - grid.origin[axis]) / grid.h[axis] - 0.5);
  const base = f.map(Math.floor);
  let sum = 0;

  for (let corner = 0; corner < 8; corner++) {
    const ijk = base.map((value, axis) => value + ((corner >> axis) & 1));
    const weight = f.reduce((product, value, axis) => {
      const fraction = value - base[axis];

      return product * (((corner >> axis) & 1) === 1 ? fraction : 1 - fraction);
    }, 1);
    const inside = ijk.every((value, axis) => value >= 0 && value < grid.n[axis]);
    const value = inside ? grid.solid[cellIndex(grid, ijk[0], ijk[1], ijk[2])] : 0;

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
  const frozen = template.solid.map((_, cell) => (frozenAt(regions, cellCenter(template, cell)) ? 1 : 0));
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
