import { conjugateGradient } from './cg';
import { densityFilter, filteredSensitivity, optimalityUpdate } from './lightenFilter';
import { frozenQuery } from './lightenFrozen';
import type { LightenFrozen, LightenInput } from './lightenTypes';
import { hexElement } from './hexElement';
import { tangentialForces } from './loads';
import { LAYERED, stiffnessFor } from './material';
import { cellCenter, hexMesh, nodesNear, type HexMesh } from './mesh';
import type { StrengthJob } from './types';
import type { VoxelGrid } from './voxels';

const SIMP_POWER = 3;
const VOID_STIFFNESS = 0.001;
const OPTIMIZATION_STEPS = 14;

interface LoadCase {
  stiffness: Float64Array;
  fixed: Uint8Array;
  forces: Float64Array;
}

function loadCase(mesh: HexMesh, job: StrengthJob): LoadCase {
  const material = LAYERED[job.material];

  if (!material) throw new Error('Choose a supported printed material.');

  const slack = Math.max(...mesh.grid.h);
  const held = nodesNear(mesh, job.load.screws, slack);
  const loaded = nodesNear(mesh, job.holds, slack);
  const fixed = new Uint8Array(mesh.positions.length).map((_, i) => held[(i / 3) | 0]);
  const forces = tangentialForces(mesh, loaded, { ...job.load, torqueNmm: -job.load.torqueNmm });
  const stiffness = hexElement(mesh.grid.h, stiffnessFor(material, job.down ?? [0, 0, -1])).stiffness;

  if (!held.includes(1) || !loaded.includes(1) || !forces.some((value) => value !== 0))
    throw new Error('The loads and supports must touch the printed part.');

  return { stiffness, fixed, forces };
}

export function elementEnergy(mesh: HexMesh, stiffness: Float64Array, u: Float64Array): Float64Array {
  const out = new Float64Array(mesh.cells.length);
  const local = new Float64Array(24);

  for (let e = 0; e < out.length; e++) {
    for (let r = 0; r < 24; r++) local[r] = u[mesh.nodes[e * 8 + ((r / 3) | 0)] * 3 + (r % 3)];

    let energy = 0;

    for (let r = 0; r < 24; r++) {
      let product = 0;

      for (let c = 0; c < 24; c++) product += stiffness[r * 24 + c] * local[c];

      energy += local[r] * product;
    }

    out[e] = Math.max(0, energy);
  }

  return out;
}

function evaluate(mesh: HexMesh, density: Float64Array, load: LoadCase) {
  const scale = density.map((value) => VOID_STIFFNESS + (1 - VOID_STIFFNESS) * value ** SIMP_POWER);
  const solved = conjugateGradient(
    { nodes: mesh.nodes, scale, stiffness: load.stiffness, fixed: load.fixed },
    load.forces,
    { tolerance: 0.002, maxIterations: 1800 },
  );

  if (!Number.isFinite(solved.residual) || solved.residual > 0.03)
    throw new Error('The stiffness solve did not converge.');

  const energy = elementEnergy(mesh, load.stiffness, solved.u);
  const compliance = energy.reduce((sum, value, e) => sum + scale[e] * value, 0);

  return { energy, compliance };
}

export function optimizeDensity(
  grid: VoxelGrid,
  input: LightenInput,
  regions: LightenFrozen,
  volumeShare = input.targetShare,
) {
  const mesh = hexMesh(grid);
  const isFrozen = frozenQuery(regions);
  const frozen = Uint8Array.from(mesh.cells, (cell) => (isFrozen(cellCenter(grid, cell)) ? 1 : 0));
  const fixedCount = frozen.reduce((sum, value) => sum + value, 0);
  const budget = Math.max(mesh.cells.length * volumeShare, fixedCount + (mesh.cells.length - fixedCount) * 0.05);

  if (!mesh.cells.length || fixedCount === mesh.cells.length)
    throw new Error('The mounting surfaces need more than the target volume.');

  const filter = densityFilter(mesh, Math.max(input.minWallMm * 1.5, 2.25));
  const loads = input.jobs.map((job) => loadCase(mesh, job));
  const initialDensity = (budget - fixedCount) / (mesh.cells.length - fixedCount);
  const baseline: number[] = [];
  let density: Float64Array = Float64Array.from(frozen, (value) => (value ? 1 : initialDensity));
  let compliance: number[] = [];

  for (let iteration = 0; iteration < OPTIMIZATION_STEPS; iteration++) {
    const gradient = new Float64Array(density.length);

    compliance = loads.map((load, index) => {
      const solved = evaluate(mesh, density, load);

      baseline[index] ??= solved.compliance;

      const weight = 1 / baseline[index];

      solved.energy.forEach((energy, e) => {
        gradient[e] -= weight * SIMP_POWER * (1 - VOID_STIFFNESS) * density[e] ** (SIMP_POWER - 1) * energy;
      });

      return solved.compliance;
    });
    density = optimalityUpdate({
      density,
      gradient: filteredSensitivity(filter, density, gradient),
      frozen,
      budget,
    });
  }

  return { mesh, density, frozen, compliance, baselineCompliance: baseline, iterations: OPTIMIZATION_STEPS };
}
