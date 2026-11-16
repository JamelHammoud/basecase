import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAYERED, type V3 } from './material';
import * as meshes from './mesh';
import { solveDisplacement, type StrengthModel } from './solve';
import type { VoxelGrid } from './voxels';

function gridFor(): VoxelGrid {
  return {
    n: [9, 2, 2],
    h: [1, 1, 1],
    origin: [0, 0, 0],
    solid: Uint8Array.from({ length: 36 }, (_, cell) => Number(cell % 9 !== 4)),
  };
}

const lineAt = (x: number) => ({ from: [x, 0, 1] as V3, to: [x, 2, 1] as V3, radius: 0.01 });

function modelFor(): StrengthModel {
  return {
    tris: [],
    material: LAYERED.PLA!,
    fill: { infill: 1, shellMm: 0 },
    normal: [0, 0, 1],
    holds: [lineAt(0)],
    load: { origin: [3, 1, 1], axis: [0, 0, 1], torqueNmm: 100, screws: [lineAt(3)] },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Strength component preparation', () => {
  it('shares one complete probe mesh and retains only solids touched by both regions', () => {
    const grid = gridFor();
    const model = modelFor();
    const before = structuredClone({ grid, model });
    const build = vi.spyOn(meshes, 'hexMesh');
    const solved = solveDisplacement(model, grid)!;

    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls[0]).toEqual([grid]);
    expect(build.mock.results[0].value.cells).toHaveLength(32);
    expect(solved.mesh.cells).toEqual(Int32Array.from({ length: 36 }, (_, c) => c).filter((c) => c % 9 < 4));
    expect(solved.u.every(Number.isFinite)).toBe(true);
    expect(solved.u.some((value) => value !== 0)).toBe(true);
    expect({ grid, model }).toEqual(before);

    model.holds = [lineAt(9)];

    expect(solveDisplacement(model, grid)).toBeNull();

    model.load.screws = [lineAt(6)];

    const moved = solveDisplacement(model, grid)!;

    expect(moved.mesh.cells).toEqual(Int32Array.from({ length: 36 }, (_, c) => c).filter((c) => c % 9 > 4));
    expect(solved.mesh.cells).toEqual(Int32Array.from({ length: 36 }, (_, c) => c).filter((c) => c % 9 < 4));
  });

  it('rejects empty grids and absent load or support regions', () => {
    const grid = gridFor();
    const model = modelFor();

    expect(solveDisplacement({ ...model, holds: [] }, grid)).toBeNull();
    expect(solveDisplacement({ ...model, load: { ...model.load, screws: [] } }, grid)).toBeNull();
    expect(solveDisplacement(model, { ...grid, solid: new Uint8Array(36) })).toBeNull();
  });
});
