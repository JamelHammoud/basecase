import { filamentGrams } from '../utils/bom';
import type { PrintMaterial } from '../types/robotics';
import { weld } from '../print/threeMf';
import { levelSetSolid, meshOfSolid, solidOfMesh, soupOfMesh, type ManifoldApi, type Solid } from '../wrap/manifold';
import type { LightenFrozen } from './lightenTypes';
import { frozenSolid } from './lightenSolid';
import type { HexMesh } from './mesh';
import type { V3 } from './types';
import type { VoxelGrid } from './voxels';
import { sampleDensityGrid, targetDensityGrid } from './lightenGrid';

function fieldBounds(grid: VoxelGrid) {
  return {
    min: grid.origin.map((value, axis) => value - grid.h[axis] * 2) as V3,
    max: grid.origin.map((value, axis) => value + (grid.n[axis] + 2) * grid.h[axis]) as V3,
  };
}

export function lightenShape(options: {
  api: ManifoldApi;
  positions: Float32Array;
  mesh: HexMesh;
  density: Float64Array;
  regions: LightenFrozen;
  minWallMm: number;
  targetShare: number;
  material: PrintMaterial;
  infillPct: number;
}) {
  const { api, positions, mesh, density, regions, minWallMm, targetShare, material, infillPct } = options;
  const welded = weld(positions);
  const original = solidOfMesh(api, { positions: welded.vertices, indices: welded.indices });

  if (!original) throw new Error('The printed part must be a closed solid.');

  const allocated: Solid[] = [original];

  try {
    const originalVolumeMm3 = original.volume();
    const originalGrams = filamentGrams(
      { volumeMm3: originalVolumeMm3, areaMm2: original.surfaceArea() },
      material,
      infillPct,
    );
    const grid = targetDensityGrid({
      mesh,
      density,
      minWallMm,
      regions,
      massTarget: { material, infillPct, originalGrams, share: targetShare },
    });
    const box = fieldBounds(mesh.grid);
    const edge = Math.min(...grid.h);
    const optimized = levelSetSolid(api, { sdf: (p) => sampleDensityGrid(grid, p), box, edge, tolerance: -1 });
    const frozen = frozenSolid(api, original, regions);

    if (!optimized || !frozen) {
      optimized?.delete();
      frozen?.delete();

      throw new Error('The minimum wall leaves no connected material.');
    }

    allocated.push(optimized, frozen);

    const keep = optimized.add(frozen);
    const result = original.intersect(keep);

    allocated.push(keep, result);

    const pieces = result.decompose();

    allocated.push(...pieces);

    const connected = pieces.sort((a, b) => b.volume() - a.volume())[0];

    if (!connected) throw new Error('The lightened part has no material.');

    const missing = frozen.subtract(connected);

    allocated.push(missing);

    if (missing.volume() > original.volume() * 1e-6)
      throw new Error('The lightened part disconnects a mounting surface.');

    const volumeMm3 = connected.volume();
    const grams = filamentGrams({ volumeMm3, areaMm2: connected.surfaceArea() }, material, infillPct);

    return {
      positions: soupOfMesh(meshOfSolid(connected)),
      originalVolumeMm3,
      volumeMm3,
      volumeShare: volumeMm3 / originalVolumeMm3,
      originalGrams,
      grams,
      massShare: grams / originalGrams,
    };
  } finally {
    allocated.forEach((solid) => solid.delete());
  }
}
