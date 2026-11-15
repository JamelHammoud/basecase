import { filamentGrams } from '../utils/bom';
import { measureTriangles } from '../three/meshMeasure';
import { loadManifold } from '../wrap/manifold';
import { frozenRegions } from './lightenFrozen';
import { optimizeDensity } from './lightenOptimize';
import { lightenShape } from './lightenShape';
import type { LightenInput, LightenResult } from './lightenTypes';
import { voxelizeAt } from './voxels';
import { validateLighten } from './lightenValidate';

export type { LightenInput, LightenResult, LightenFrozen, LightenBox, LightenPlane } from './lightenTypes';

const MAX_CELLS = 40_000;

export async function lightenPart(input: LightenInput): Promise<LightenResult> {
  const started = performance.now();

  const spacing = validateLighten(input);

  const positions = Float32Array.from(input.positions);
  const grid = voxelizeAt(positions, spacing);

  if (grid.solid.reduce((sum, value) => sum + value, 0) > MAX_CELLS)
    throw new Error('The printed part exceeds the lightening cell limit.');

  const regions = frozenRegions(input);
  const measure = measureTriangles(positions);
  const job = input.jobs[0];
  const originalMass = filamentGrams(measure, job.material, job.infillPct);
  const solidMass = filamentGrams(measure, job.material, 100);
  const volumeShare = (input.targetShare * originalMass) / solidMass;
  const optimized = optimizeDensity(grid, input, regions, volumeShare);
  const api = await loadManifold();
  const shape = lightenShape({
    api,
    positions,
    ...optimized,
    regions,
    minWallMm: input.minWallMm,
    targetShare: input.targetShare,
    material: input.jobs[0].material,
    infillPct: input.jobs[0].infillPct,
  });

  if (shape.massShare >= 0.99) throw new Error('The mounting surfaces leave no material to remove.');

  return {
    ...shape,
    iterations: optimized.iterations,
    compliance: optimized.compliance,
    cellMm: Math.max(...grid.h),
    ms: performance.now() - started,
  };
}
