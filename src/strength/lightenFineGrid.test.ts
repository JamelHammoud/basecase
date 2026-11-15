import { afterEach, describe, expect, it, vi } from 'vitest';
import * as expansion from './lightenFineGrid';
import { targetDensityGrid } from './lightenGrid';
import { hexMesh, type HexMesh } from './mesh';
import type { V3 } from './types';

function meshFor(n: V3, sparse = false): HexMesh {
  return hexMesh({
    n,
    h: [0.75, 1.25, 2],
    origin: [-8.5, 3.25, -2],
    solid: Uint8Array.from({ length: n[0] * n[1] * n[2] }, (_, cell) => (sparse && cell % 7 === 3 ? 0 : 1)),
  });
}

function referenceGrid(mesh: HexMesh, ranked: number[], count: number, paths: Uint8Array): expansion.FineGrid {
  const n = mesh.grid.n.map((value) => value * 2) as V3;
  const kept = new Set(ranked.slice(0, count).map((e) => mesh.cells[e]));
  const solid = Uint8Array.from({ length: n[0] * n[1] * n[2] }, (_, cell) => {
    const i = Math.floor((cell % n[0]) / 2);
    const j = Math.floor((Math.floor(cell / n[0]) % n[1]) / 2);
    const k = Math.floor(Math.floor(cell / (n[0] * n[1])) / 2);
    const coarse = (k * mesh.grid.n[1] + j) * mesh.grid.n[0] + i;

    return kept.has(coarse) || paths[coarse] ? 1 : 0;
  });

  return { origin: mesh.grid.origin, n, h: mesh.grid.h.map((value) => value / 2) as V3, solid };
}

afterEach(() => vi.restoreAllMocks());

describe('Lighten coarse-cell expansion', () => {
  it('matches child-to-parent lookup across sparse grids, path-only cells and ranked prefixes', () => {
    for (let seed = 0; seed < 40; seed++) {
      const mesh = meshFor([1 + (seed % 5), 1 + (seed % 4), 1 + (seed % 3)], seed % 2 === 0);
      const ranked = Array.from(mesh.cells, (_, e) => e).reverse();
      const paths = Uint8Array.from(mesh.grid.solid, (_, cell) => (cell % 3 === seed % 3 ? 1 : 0));
      const before = structuredClone({ mesh, ranked, paths });

      for (const count of [0, 1, Math.floor(ranked.length / 2), ranked.length]) {
        expect(expansion.fineGrid(mesh, ranked, count, paths)).toEqual(referenceGrid(mesh, ranked, count, paths));
      }

      expect({ mesh, ranked, paths }).toEqual(before);
    }
  });

  it('rebuilds changed ranks, mounts and dimensions without changing previous results', () => {
    const mesh = meshFor([3, 2, 1]);
    const ranked = [0, 2, 4, 1, 3, 5];
    const paths = Uint8Array.of(0, 0, 0, 0, 0, 1);
    const first = expansion.fineGrid(mesh, ranked, 2, paths);
    const before = structuredClone(first);

    ranked.reverse();
    paths.fill(0);
    paths[3] = 1;
    mesh.cells.reverse();
    mesh.grid.n = [1, 3, 2];
    mesh.grid.h = [2, 1, 0.5];
    mesh.grid.origin = [4, -2, 6];

    const next = expansion.fineGrid(mesh, ranked, 3, paths);

    expect(next).toEqual(referenceGrid(mesh, ranked, 3, paths));
    expect(first).toEqual(before);
    expect(next.solid).not.toBe(first.solid);
  });

  it('keeps empty grids and unretained cells empty', () => {
    for (const n of [
      [0, 2, 3],
      [2, 0, 3],
      [2, 3, 0],
      [1, 1, 1],
    ] as V3[]) {
      const mesh = meshFor(n);
      const result = expansion.fineGrid(mesh, [], 0, new Uint8Array(mesh.grid.solid.length));

      expect(result).toEqual(referenceGrid(mesh, [], 0, new Uint8Array(mesh.grid.solid.length)));
      expect(result.solid.every((value) => value === 0)).toBe(true);
    }
  });

  it.each([3, 6])('selects each parent once on a 10 × 10 × %s grid', (depth) => {
    const mesh = meshFor([10, 10, depth], true);
    const ranked = Array.from(mesh.cells, (_, e) => e);
    const paths = new Uint8Array(mesh.grid.solid.length);
    const lookup = vi.spyOn(Set.prototype, 'has');
    const result = expansion.fineGrid(mesh, ranked, ranked.length / 2, paths);
    const lookups = lookup.mock.calls.length;

    lookup.mockClear();

    const expected = referenceGrid(mesh, ranked, ranked.length / 2, paths);
    const previousLookups = lookup.mock.calls.length;

    lookup.mockRestore();

    expect(result).toEqual(expected);
    expect(lookups).toBe(mesh.grid.solid.length);
    expect(previousLookups).toBe(mesh.grid.solid.length * 8);
  });

  it.each([0.25, 0.5, 0.8])('preserves complete mass searches at target share %s', (share) => {
    for (const sparse of [false, true]) {
      const mesh = meshFor([5, 4, 3], sparse);
      const options = {
        mesh,
        density: Float64Array.from(mesh.cells, (_, e) => ((e * 17) % 23) / 23),
        minWallMm: 1.5,
        regions: { boxes: [{ min: [-8.5, 3.25, -2] as V3, max: [-7.75, 4.5, 0] as V3 }] },
        massTarget: { material: 'PLA' as const, infillPct: 20, originalGrams: 0.2, share },
      };
      const actual = targetDensityGrid(options);
      const builder = vi.spyOn(expansion, 'fineGrid').mockImplementation(referenceGrid);
      const expected = targetDensityGrid(options);

      builder.mockRestore();

      expect(actual).toEqual(expected);
    }
  });
});
