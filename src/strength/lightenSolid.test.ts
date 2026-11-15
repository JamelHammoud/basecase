import { describe, expect, it } from 'vitest';
import { loadManifold } from '../wrap/manifold';
import { frozenSolid } from './lightenSolid';
import type { V3 } from './types';

describe('frozen mate face slabs', () => {
  it.each<V3>([
    [0, 2, 0],
    [0, -3, 0],
  ])('preserves the exact y=2 through y=4 slab for normal %j', async (...normal) => {
    const api = await loadManifold();
    const original = api.Manifold.cube([10, 10, 10]);
    const cube = api.Manifold.cube([10, 2, 10]);
    const expected = cube.translate([0, 2, 0]);
    const actual = frozenSolid(api, original, {
      planes: [{ point: [0, 3, 0], normal, halfThickness: 1 }],
    });
    const missing = expected.subtract(actual);
    const extra = actual.subtract(expected);

    expect(actual.status()).toBe('NoError');
    expect(actual.volume()).toBeCloseTo(200, 8);
    expect(missing.volume()).toBeCloseTo(0, 8);
    expect(extra.volume()).toBeCloseTo(0, 8);
    [original, cube, expected, actual, missing, extra].forEach((solid) => solid.delete());
  });
});
