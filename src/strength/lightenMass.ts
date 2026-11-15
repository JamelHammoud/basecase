import { filamentGrams } from '../utils/bom';
import type { PrintMaterial } from '../types/robotics';
import type { FineGrid } from './lightenGrid';

export interface LightenMassTarget {
  material: PrintMaterial;
  infillPct: number;
  originalGrams: number;
  share: number;
}

export function gridMass(grid: FineGrid, mask: Uint8Array, target: LightenMassTarget): number {
  const [nx, ny, nz] = grid.n;
  const [hx, hy, hz] = grid.h;
  const faceAreas = [hy * hz, hx * hz, hx * hy];
  let volumeMm3 = 0;
  let areaMm2 = 0;

  for (let cell = 0; cell < mask.length; cell++) {
    if (!mask[cell]) continue;

    volumeMm3 += hx * hy * hz;

    const ijk = [cell % nx, Math.floor(cell / nx) % ny, Math.floor(cell / (nx * ny))];
    const strides = [1, nx, nx * ny];
    const sizes = [nx, ny, nz];

    for (let axis = 0; axis < 3; axis++) {
      if (ijk[axis] === 0 || !mask[cell - strides[axis]]) areaMm2 += faceAreas[axis];

      if (ijk[axis] === sizes[axis] - 1 || !mask[cell + strides[axis]]) areaMm2 += faceAreas[axis];
    }
  }

  return filamentGrams({ volumeMm3, areaMm2 }, target.material, target.infillPct);
}
