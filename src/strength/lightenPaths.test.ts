import { afterEach, describe, expect, it, vi } from 'vitest';
import { interfacePaths } from './lightenPaths';
import { cellCenter, hexMesh, type HexMesh } from './mesh';
import type { V3 } from './material';
import * as neighborhood from './voxelNeighbours';

function meshFor(n: V3, keep: (cell: number) => boolean = () => true): HexMesh {
  return hexMesh({
    n,
    h: [1, 2, 3],
    origin: [-5, 7, 11],
    solid: Uint8Array.from({ length: n[0] * n[1] * n[2] }, (_, cell) => Number(keep(cell))),
  });
}

const mounts = (mesh: HexMesh, cells: number[]) => ({
  boxes: cells.map((cell) => ({ min: cellCenter(mesh.grid, cell), max: cellCenter(mesh.grid, cell) })),
});

function trackQueries() {
  const original = neighborhood.voxelNeighbours;
  const cells: number[] = [];

  vi.spyOn(neighborhood, 'voxelNeighbours').mockImplementation((grid) => {
    const neighbors = original(grid);

    return (cell) => {
      cells.push(cell);

      return neighbors(cell);
    };
  });

  return cells;
}

function shortestMasks(mesh: HexMesh, density: Float64Array, target: number): number[] {
  const resistance = new Float64Array(mesh.grid.solid.length).fill(Infinity);
  const neighbors = neighborhood.voxelNeighbours(mesh.grid);
  let best = Infinity;
  let masks: number[] = [];

  mesh.cells.forEach((cell, e) => (resistance[cell] = 1 / (0.001 + density[e] ** 3)));

  function visit(cell: number, cost: number, mask: number) {
    if (cost > best + 1e-9) return;

    if (cell === target) {
      masks = cost < best - 1e-9 ? [] : masks;
      best = Math.min(best, cost);
      masks.push(mask);

      return;
    }

    for (const other of [...neighbors(cell)]) {
      if (!mesh.grid.solid[other] || mask & (1 << other)) continue;

      visit(other, cost + (resistance[cell] + resistance[other]) / 2, mask | (1 << other));
    }
  }

  visit(0, 0, 1);

  return masks;
}

afterEach(() => vi.restoreAllMocks());

describe('Lighten mounting search completion', () => {
  it.each([300, 600])('leaves the unused tail of a %s-cell solid unsearched', (length) => {
    const mesh = meshFor([length, 1, 1]);
    const density = new Float64Array(length).fill(1);
    const regions = mounts(mesh, [0, 1, 2, 2]);
    const before = structuredClone({ mesh, density, regions });
    const queried = trackQueries();

    expect(interfacePaths(mesh, density, regions)).toEqual(Uint8Array.from({ length }, (_, cell) => Number(cell <= 2)));
    expect(queried).toEqual([0, 1]);
    expect({ mesh, density, regions }).toEqual(before);
    queried.length = 0;

    expect(interfacePaths(mesh, density, mounts(mesh, [0]))).toEqual(
      Uint8Array.from({ length }, (_, cell) => Number(cell === 0)),
    );
    expect(queried).toEqual([]);
  });

  it('waits for the cheapest path to every mounting cell, including dense detours', () => {
    const mesh = meshFor([5, 3, 1]);
    const density = Float64Array.from(mesh.cells, (cell) => (cell > 0 && cell < 4 ? 0.05 : 1));
    const queried = trackQueries();
    const path = interfacePaths(mesh, density, mounts(mesh, [0, 4, 9]));

    expect(Array.from(path.keys()).filter((cell) => path[cell])).toEqual([0, 4, 5, 6, 7, 8, 9]);
    expect(queried).toContain(9);
    expect(queried).not.toContain(4);
    queried.length = 0;
    density.fill(1);

    expect(interfacePaths(mesh, density, mounts(mesh, [0, 4]))).toEqual(
      Uint8Array.from({ length: 15 }, (_, cell) => Number(cell < 5)),
    );
    expect(queried).not.toContain(4);
  });

  it('exhausts reachable cells before refusing a disconnected mounting cell', () => {
    const mesh = meshFor([7, 1, 1], (cell) => cell !== 3);
    const density = new Float64Array(mesh.cells.length).fill(1);
    const queried = trackQueries();

    expect(() => interfacePaths(mesh, density, mounts(mesh, [0, 2, 6]))).toThrow('disconnected');
    expect(queried).toEqual([0, 1, 2]);
    mesh.grid.solid[3] = 1;

    expect(interfacePaths(meshFor([7, 1, 1]), new Float64Array(7).fill(1), mounts(mesh, [0, 6]))).toEqual(
      new Uint8Array(7).fill(1),
    );
  });

  it('matches exhaustive simple paths for weighted, tied and perforated solids', () => {
    for (let seed = 0; seed < 24; seed++) {
      const mesh = meshFor([3, 3, 1], (cell) => seed % 2 === 0 || cell !== 4);
      const density = Float64Array.from(mesh.cells, (cell) =>
        seed % 3 === 0 ? 1 : 0.1 + ((cell * 37 + seed * 19) % 101) / 101,
      );
      const targets = [2, 6, 8];
      const possible = targets.reduce(
        (masks, target) => masks.flatMap((mask) => shortestMasks(mesh, density, target).map((other) => mask | other)),
        [1],
      );
      const path = interfacePaths(mesh, density, mounts(mesh, [0, ...targets]));
      const mask = path.reduce((bits, value, cell) => bits | (value << cell), 0);

      expect(possible).toContain(mask);
    }
  });
});
