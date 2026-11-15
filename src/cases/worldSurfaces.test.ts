import { describe, expect, it } from 'vitest';
import type { V3 } from '../utils/kinematics';
import { floorSupport, terrainPieces } from './worldSurfaces';

const box = (min: V3, max: V3) => ({
  positions: new Float32Array([
    min[0],
    min[1],
    min[2],
    max[0],
    min[1],
    min[2],
    max[0],
    min[1],
    max[2],
    min[0],
    min[1],
    max[2],
    min[0],
    max[1],
    min[2],
    max[0],
    max[1],
    min[2],
    max[0],
    max[1],
    max[2],
    min[0],
    max[1],
    max[2],
  ]),
  indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6]),
});

const floor = box([-2000, -20, -2000], [2000, 0, 2000]);

describe('world support surfaces', () => {
  it('supports only the floor triangles, preserving gaps between separate floor sections', () => {
    const supported = floorSupport([
      box([-2000, -20, -2000], [-200, 0, 2000]),
      box([200, -20, -2000], [2000, 0, 2000]),
    ]);

    expect(supported([0, 0, 0])).toBe(false);
    expect(supported([-500, 0, 0])).toBe(true);
    expect(supported([500, 0, 0])).toBe(true);
    expect(supported([2500, 0, 0])).toBe(false);
  });

  it('connects the stair tops to the floor while keeping an overhead tabletop out of terrain', () => {
    const steps = Array.from({ length: 6 }, (_, index) =>
      box([-500, 0, index * 250], [500, (index + 1) * 40, (index + 1) * 250]),
    );
    const table = box([-500, 700, -500], [500, 750, 500]);

    expect([...terrainPieces([floor, ...steps, table])]).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('connects a sloping top to the ground without treating its underside as a top face', () => {
    const ramp = box([-500, -20, 0], [500, 0, 3000]);

    for (let i = 0; i < ramp.positions.length; i += 3) ramp.positions[i + 1] += ramp.positions[i + 2] * 0.1;

    expect([...terrainPieces([floor, ramp])]).toEqual([0, 1]);
    expect(terrainPieces([floor, box([-500, 0, 0], [500, 750, 500])]).has(1)).toBe(false);
  });

  it('recognizes sloping hull tops when their bounding box centre lies outside the convex hull', () => {
    const ramp = {
      positions: new Float32Array([0, 0, 0, 2000, 0, 0, 0, 0, 2000, 0, 200, 0]),
      indices: new Uint32Array([0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2]),
    };
    const reversed = { ...ramp, indices: new Uint32Array(ramp.indices).reverse() };

    expect([...terrainPieces([floor, ramp])]).toEqual([0, 1]);
    expect([...terrainPieces([floor, reversed])]).toEqual([0, 1]);
    expect(floorSupport([ramp])([500, 0, 500])).toBe(false);
  });
});
