import { afterEach, describe, expect, it, vi } from 'vitest';
import { densityFilter, filteredSensitivity, type DensityFilter } from './lightenFilter';
import { targetDensityGrid } from './lightenGrid';
import { hexMesh, type HexMesh } from './mesh';
import type { V3 } from './types';

function meshFor(n: V3, h: V3 = [1, 1, 1], sparse = false): HexMesh {
  const solid = Uint8Array.from({ length: n[0] * n[1] * n[2] }, (_, cell) => (sparse && cell % 7 === 0 ? 0 : 1));

  return hexMesh({ n, h, origin: [-8.5, 3.25, -2], solid });
}

function pairwiseFilter(mesh: HexMesh, radius: number): DensityFilter {
  const { n, h } = mesh.grid;
  const coordinates = (cell: number) => [cell % n[0], Math.floor(cell / n[0]) % n[1], Math.floor(cell / (n[0] * n[1]))];
  const elements = Array.from(mesh.cells, (cell, e) => ({ cell, e, at: coordinates(cell) })).sort(
    (a, b) => a.cell - b.cell,
  );
  const start = [0];
  const near: number[] = [];
  const weight: number[] = [];

  for (const cell of mesh.cells) {
    const own = coordinates(cell);

    for (const { e, at } of elements) {
      const distance = at.map((value, axis) => (value - own[axis]) * h[axis]);
      const w = radius - Math.hypot(...distance);

      if (w <= 0) continue;

      near.push(e);
      weight.push(w);
    }

    start.push(near.length);
  }

  return { start: Int32Array.from(start), near: Int32Array.from(near), weight: Float64Array.from(weight) };
}

afterEach(() => vi.restoreAllMocks());

describe('Lighten filter neighborhoods', () => {
  it.each([0.25, 1.25, 2.5, 4.1])('matches every element pair at radius %s on a sparse anisotropic grid', (radius) => {
    const mesh = meshFor([5, 4, 3], [0.75, 1.25, 2], true);

    mesh.cells.reverse();

    const before = structuredClone(mesh);
    const filter = densityFilter(mesh, radius);
    const density = new Float64Array(mesh.cells.length).fill(0.4);
    const raw = new Float64Array(mesh.cells.length).fill(-2);

    expect(filter).toEqual(pairwiseFilter(mesh, radius));
    expect(filteredSensitivity(filter, density, raw).every((value) => Math.abs(value + 2) < 1e-12)).toBe(true);
    expect(mesh).toEqual(before);
  });

  it('keeps an empty filter empty', () => {
    expect(densityFilter(meshFor([0, 0, 0]), 1.5)).toEqual({
      start: Int32Array.of(0),
      near: new Int32Array(),
      weight: new Float64Array(),
    });
  });

  it.each([3, 6])('prepares density weights once for a 10 × 10 × %s grid', (depth) => {
    const mesh = meshFor([10, 10, depth]);
    const distance = vi.spyOn(Math, 'hypot');
    const filter = densityFilter(mesh, 1.5);

    expect(distance.mock.calls.length).toBeLessThanOrEqual(125);
    expect(filter.start.at(-1)).toBe(filter.near.length);
    expect(filter.near.length).toBeGreaterThan(mesh.cells.length);
  });

  it.each([6, 12])('shares one wall neighborhood across mass trials on a %s × 5 × 4 grid', (width) => {
    const mesh = meshFor([width, 5, 4], [1, 1.5, 2]);
    const density = Float64Array.from(mesh.cells, (_, e) => 1 - e / mesh.cells.length);
    const before = structuredClone({ mesh, density });
    const distance = vi.spyOn(Math, 'hypot');
    const result = targetDensityGrid({
      mesh,
      density,
      minWallMm: 1.5,
      regions: { boxes: [{ min: [-8.5, 3.25, -2], max: [-7.5, 4.75, 0] }] },
      massTarget: { material: 'PLA', infillPct: 100, originalGrams: width * 5 * 4 * 3 * 0.00126, share: 0.5 },
    });

    expect(distance.mock.calls.length).toBeLessThanOrEqual(175);
    expect(result.n).toEqual([width * 2, 10, 8]);
    expect(result.h).toEqual([0.5, 0.75, 1]);
    expect(result.solid.includes(1)).toBe(true);
    expect(result.solid.includes(0)).toBe(true);
    expect({ mesh, density }).toEqual(before);
  });
});
