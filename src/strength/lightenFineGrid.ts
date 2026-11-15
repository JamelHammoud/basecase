import type { HexMesh } from './mesh';
import type { V3 } from './types';

export interface FineGrid {
  origin: V3;
  n: V3;
  h: V3;
  solid: Uint8Array;
}

export function fineGrid(mesh: HexMesh, ranked: number[], count: number, paths: Uint8Array): FineGrid {
  const { grid } = mesh;
  const [nx, ny, nz] = grid.n;
  const n: V3 = [nx * 2, ny * 2, nz * 2];
  const h = grid.h.map((value) => value / 2) as V3;
  const solid = new Uint8Array(n[0] * n[1] * n[2]);
  const kept = new Set(ranked.slice(0, count).map((e) => mesh.cells[e]));
  const layer = n[0] * n[1];

  for (let cell = 0; cell < nx * ny * nz; cell++) {
    if (!kept.has(cell) && !paths[cell]) continue;

    const i = cell % nx;
    const j = Math.floor(cell / nx) % ny;
    const k = Math.floor(cell / (nx * ny));
    const start = (k * 2 * n[1] + j * 2) * n[0] + i * 2;

    solid.fill(1, start, start + 2);
    solid.fill(1, start + n[0], start + n[0] + 2);
    solid.fill(1, start + layer, start + layer + 2);
    solid.fill(1, start + layer + n[0], start + layer + n[0] + 2);
  }

  return { origin: grid.origin, n, h, solid };
}
