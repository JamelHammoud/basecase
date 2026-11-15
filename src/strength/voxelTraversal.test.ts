import { afterEach, describe, expect, it, vi } from 'vitest';
import { interfacePaths } from './lightenPaths';
import { components, hexMesh, cellCenter, type HexMesh } from './mesh';
import type { V3 } from './material';
import { surfaceDepth, type VoxelGrid } from './voxels';
import * as neighborhood from './voxelNeighbours';

function gridFor(n: V3, keep: (cell: number) => boolean = () => true): VoxelGrid {
  return {
    n,
    h: [0.75, 1.5, 2],
    origin: [-3, 4, 2],
    solid: Uint8Array.from({ length: n[0] * n[1] * n[2] }, (_, cell) => Number(keep(cell))),
  };
}

const coordinates = (grid: VoxelGrid, cell: number) => [
  cell % grid.n[0],
  Math.floor(cell / grid.n[0]) % grid.n[1],
  Math.floor(cell / (grid.n[0] * grid.n[1])),
];

function distance(grid: VoxelGrid, a: number, b: number): number {
  const from = coordinates(grid, a);

  return coordinates(grid, b).reduce((sum, value, axis) => sum + Math.abs(value - from[axis]), 0);
}

function expectedDepth(grid: VoxelGrid): Int32Array {
  const empty = Array.from(grid.solid.keys()).filter((cell) => !grid.solid[cell]);

  return Int32Array.from(grid.solid, (solid, cell) => {
    if (!solid) return -1;

    const toBoundary = coordinates(grid, cell).flatMap((value, axis) => [value, grid.n[axis] - 1 - value]);

    return Math.min(...toBoundary, ...empty.map((other) => distance(grid, cell, other) - 1));
  });
}

function expectedLabels(grid: VoxelGrid): Int32Array {
  const roots = Int32Array.from(grid.solid, (solid, cell) => (solid ? cell : -1));
  const rootOf = (cell: number): number => {
    while (roots[cell] !== cell) cell = roots[cell];

    return cell;
  };
  const solid = Array.from(roots).filter((cell) => cell >= 0);

  for (const cell of solid) {
    for (const other of solid) {
      if (distance(grid, cell, other) !== 1) continue;

      const a = rootOf(cell);
      const b = rootOf(other);

      roots[Math.max(a, b)] = Math.min(a, b);
    }
  }

  const ordered = [...new Set(solid.map(rootOf))].sort((a, b) => a - b);

  return Int32Array.from(grid.solid, (value, cell) => (value ? ordered.indexOf(rootOf(cell)) : -1));
}

function mounts(mesh: HexMesh, cells: number[]) {
  return { boxes: cells.map((cell) => ({ min: cellCenter(mesh.grid, cell), max: cellCenter(mesh.grid, cell) })) };
}

function trackQueries() {
  const original = neighborhood.voxelNeighbours;
  const buffers = new Set<number[]>();
  const cells: number[] = [];
  const prepare = vi.spyOn(neighborhood, 'voxelNeighbours').mockImplementation((grid) => {
    const query = original(grid);

    return (cell) => {
      const out = query(cell);

      cells.push(cell);
      buffers.add(out);

      return out;
    };
  });

  return { prepare, buffers, cells };
}

afterEach(() => vi.restoreAllMocks());

describe('voxel traversal workspaces', () => {
  it.each<V3>([
    [1, 1, 1],
    [1, 4, 3],
    [4, 1, 3],
    [4, 3, 1],
    [4, 3, 5],
  ])('keeps ordered face neighbors without wrapping rows or planes for %j', (nx, ny, nz) => {
    const grid = gridFor([nx, ny, nz]);
    const before = structuredClone(grid);
    const query = neighborhood.voxelNeighbours(grid);
    const buffers = new Set<number[]>();
    const directions = [
      [-1, 0, 0],
      [1, 0, 0],
      [0, -1, 0],
      [0, 1, 0],
      [0, 0, -1],
      [0, 0, 1],
    ];

    for (const cell of grid.solid.keys()) {
      const own = coordinates(grid, cell);
      const expected = directions
        .map((step) => own.map((value, axis) => value + step[axis]))
        .filter((at) => at.every((value, axis) => value >= 0 && value < grid.n[axis]))
        .map(([x, y, z]) => (z * ny + y) * nx + x);
      const actual = query(cell);

      expect(actual).toEqual(expected);
      buffers.add(actual);
    }

    expect(buffers.size).toBe(1);
    expect(neighborhood.voxelNeighbours(grid)(0)).not.toBe(query(0));
    expect(grid).toEqual(before);
  });

  it('prepares edited dimensions afresh and keeps interleaved queries independent', () => {
    const grid = gridFor([3, 2, 1]);
    const first = neighborhood.voxelNeighbours(grid);
    const saved = first(1);

    grid.n = [1, 2, 3];

    const second = neighborhood.voxelNeighbours(grid);

    expect(second(1)).toEqual([0, 3]);
    expect(saved).toEqual([0, 2, 4]);
    expect(first(5)).toBe(saved);
    expect(saved).toEqual([4, 2]);
    expect(second(0)).toEqual([1, 2]);
  });

  it.each(['solid', 'cavity', 'sparse', 'diagonal', 'empty'])('keeps depths and components for %s solids', (kind) => {
    const keep: Record<string, (cell: number) => boolean> = {
      solid: () => true,
      cavity: (cell) => cell !== 62,
      sparse: (cell) => cell % 7 !== 0 && Math.floor(cell / 5) % 5 !== 2,
      diagonal: (cell) => cell === 0 || cell === 6 || cell === 31 || cell === 124,
      empty: () => false,
    };
    const grid = gridFor([5, 5, 5], keep[kind]);
    const before = structuredClone(grid);
    const depth = surfaceDepth(grid);
    const labels = components(grid);

    expect(depth).toEqual(expectedDepth(grid));
    expect(labels).toEqual(expectedLabels(grid));
    expect(grid).toEqual(before);
    grid.solid.fill(1);
    expect(surfaceDepth(grid)).toEqual(expectedDepth(grid));
    expect(components(grid)).toEqual(new Int32Array(grid.solid.length));
    expect(depth).toEqual(expectedDepth(before));
    expect(labels).toEqual(expectedLabels(before));
  });

  it('keeps empty grids and single-axis solids separate from missing cells', () => {
    const empty = gridFor([0, 0, 0]);
    const thin = gridFor([1, 5, 1], (cell) => cell !== 2);

    expect(surfaceDepth(empty)).toEqual(new Int32Array());
    expect(components(empty)).toEqual(new Int32Array());
    expect(surfaceDepth(thin)).toEqual(Int32Array.of(0, 0, -1, 0, 0));
    expect(components(thin)).toEqual(Int32Array.of(0, 0, -1, 1, 1));
  });
});

describe('voxel mounting paths and traversal counts', () => {
  it('keeps the first equal-cost mounting path and prefers denser detours', () => {
    const tied = hexMesh(gridFor([2, 2, 1]));

    expect(interfacePaths(tied, new Float64Array(4).fill(1), mounts(tied, [0, 3]))).toEqual(Uint8Array.of(1, 1, 0, 1));

    const mesh = hexMesh(gridFor([5, 3, 1]));
    const density = Float64Array.from(mesh.cells, (cell) => (cell > 0 && cell < 4 ? 0.05 : 1));
    const regions = mounts(mesh, [0, 4, 9]);
    const before = structuredClone({ mesh, density, regions });
    const path = interfacePaths(mesh, density, regions);

    expect(Array.from(path.keys()).filter((cell) => path[cell])).toEqual([0, 4, 5, 6, 7, 8, 9]);
    expect(interfacePaths(mesh, density, regions)).toEqual(path);
    expect({ mesh, density, regions }).toEqual(before);
    expect(interfacePaths(mesh, new Float64Array(15).fill(1), mounts(mesh, [0, 4]))).toEqual(
      Uint8Array.from({ length: 15 }, (_, cell) => Number(cell < 5)),
    );
  });

  it('refuses disconnected mounts and mounts outside the solid', () => {
    const mesh = hexMesh(gridFor([5, 1, 1], (cell) => cell !== 2));
    const density = new Float64Array(mesh.cells.length).fill(1);

    expect(() => interfacePaths(mesh, density, mounts(mesh, [0, 4]))).toThrow('disconnected');
    expect(() => interfacePaths(mesh, density, mounts(mesh, [2]))).toThrow('do not touch');
    expect(interfacePaths(mesh, density, mounts(mesh, [0]))).toEqual(Uint8Array.of(1, 0, 0, 0, 0));
  });

  it.each([3, 6])('uses one buffer per operation on a 10 × 10 × %s grid', (height) => {
    const grid = gridFor([10, 10, height]);
    const work = trackQueries();
    const labels = components(grid);

    expect(labels).toEqual(new Int32Array(grid.solid.length));
    expect(work.prepare).toHaveBeenCalledTimes(1);
    expect(work.buffers.size).toBe(1);
    expect(work.cells).toHaveLength(grid.solid.length);
    expect(new Set(work.cells).size).toBe(grid.solid.length);
    work.prepare.mockClear();
    work.buffers.clear();
    work.cells.length = 0;

    expect(surfaceDepth(grid)).toEqual(expectedDepth(grid));
    expect(work.prepare).toHaveBeenCalledTimes(1);
    expect(work.buffers.size).toBe(1);
    expect(work.cells).toHaveLength(grid.solid.length * 2);
    work.prepare.mockClear();
    work.buffers.clear();
    work.cells.length = 0;

    const mesh = hexMesh(grid);
    const path = interfacePaths(
      mesh,
      new Float64Array(mesh.cells.length).fill(1),
      mounts(mesh, [0, grid.solid.length - 1]),
    );

    expect(path.reduce((sum, value) => sum + value, 0)).toBe(18 + height);
    expect(work.prepare).toHaveBeenCalledTimes(1);
    expect(work.buffers.size).toBe(1);
    expect(work.cells).toHaveLength(grid.solid.length - 1);
    expect(new Set(work.cells).size).toBe(grid.solid.length - 1);
  });
});
