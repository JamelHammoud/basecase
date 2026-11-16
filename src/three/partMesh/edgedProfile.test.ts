import { describe, expect, it, vi } from 'vitest';
import type { PartEdges } from '../../types/robotics';
import type { Outline } from '../../utils/partEdges';
import { clockwise, cornerDirs, insetCorner, outlineCorners, type Vec2 } from './edgedProfile';

function formerCorners(outline: Outline, edges: PartEdges) {
  const ring = clockwise(outline);
  const normal = (a: Vec2, b: Vec2): Vec2 => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;

    return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  };

  return ring.map((at, i) => {
    const from = normal(ring[(i + ring.length - 1) % ring.length], at);
    const to = normal(at, ring[(i + 1) % ring.length]);

    return { center: insetCorner(at, [from, to], edges.mm), dirs: cornerDirs(from, to, edges.kind) };
  });
}

const outlines: Outline[] = [
  [],
  [[0, 0]],
  [
    [0, 0],
    [4, 2],
  ],
  [
    [0, 0],
    [0, 0],
    [3, 2],
    [4, 0],
  ],
  [
    [-0, 0],
    [0, -0],
    [0, 0],
  ],
  [
    [0, 0],
    [1e-12, 0],
    [0, 1e-12],
  ],
  ...Array.from({ length: 60 }, (_, i): Outline =>
    Array.from({ length: 3 + (i % 10) }, (_, k): Vec2 => {
      const angle = (k * 2 * Math.PI) / (3 + (i % 10));

      return [Math.cos(angle) * (i + 1) + i, Math.sin(angle) * (i + 3) - i];
    }),
  ),
];

describe('edged prism corner normals', () => {
  it.each<PartEdges['kind']>(['fillet', 'chamfer'])('preserves %s corners across winding and later edits', (kind) => {
    for (const outline of outlines) {
      for (const ring of [outline, [...outline].reverse()]) {
        const saved = structuredClone(ring);
        const edges = { kind, mm: 0.2 };
        const actual = outlineCorners(ring, edges);

        expect(actual).toEqual(formerCorners(ring, edges));
        expect(ring).toEqual(saved);

        if (!ring.length) continue;

        ring[0] = [ring[0][0] + 2, ring[0][1] - 3];
        expect(outlineCorners(ring, edges)).toEqual(formerCorners(ring, edges));
        expect(actual).toEqual(formerCorners(saved, edges));
        ring[0] = saved[0];
      }
    }
  });

  it.each([3, 4, 6])('normalizes each of %i edges once', (count) => {
    const outline: Outline = Array.from({ length: count }, (_, i) => [Math.cos(i), Math.sin(i)]);
    const hypot = vi.spyOn(Math, 'hypot');

    try {
      outlineCorners(outline, { kind: 'chamfer', mm: 0.2 });
      expect(hypot).toHaveBeenCalledTimes(count);
    } finally {
      hypot.mockRestore();
    }
  });

  it('keeps chamfer directions independent between corners and calls', () => {
    const outline: Outline = [
      [0, 0],
      [0, 4],
      [4, 4],
      [4, 0],
    ];
    const edges: PartEdges = { kind: 'chamfer', mm: 0.2 };
    const result = outlineCorners(outline, edges);
    const directions = result.flatMap((corner) => corner.dirs);

    expect(new Set(directions).size).toBe(directions.length);
    result[0].dirs[1][0] = 100;
    expect(outlineCorners(outline, edges)).toEqual(formerCorners(outline, edges));
  });
});
