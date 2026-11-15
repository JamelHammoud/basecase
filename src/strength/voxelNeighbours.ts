import type { VoxelGrid } from './voxels';

export function voxelNeighbours(g: Pick<VoxelGrid, 'n'>): (cell: number) => number[] {
  const [nx, ny, nz] = g.n;
  const plane = nx * ny;
  const out: number[] = [];

  return (cell) => {
    const i = cell % nx;
    const j = Math.floor(cell / nx) % ny;
    const k = Math.floor(cell / plane);

    out.length = 0;

    if (i > 0) out.push(cell - 1);

    if (i < nx - 1) out.push(cell + 1);

    if (j > 0) out.push(cell - nx);

    if (j < ny - 1) out.push(cell + nx);

    if (k > 0) out.push(cell - plane);

    if (k < nz - 1) out.push(cell + plane);

    return out;
  };
}
