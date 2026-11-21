import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { ShapeSolid } from '../three/analysis/shapeSolid';
import { edgeVisibility } from './drawingVisibility';
import { DRAWING_LIMITS } from './drawingTypes';

it('splits a partially occluded edge at triangle boundaries, retaining both visible ends', () => {
  const geometry = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute([2, -1, 1, 8, -1, 1, 8, 1, 1, 2, -1, 1, 8, 1, 1, 2, 1, 1], 3),
  );
  const solid = new ShapeSolid(geometry.getAttribute('position').array as Float32Array);
  const visible = edgeVisibility(solid, { u: 0, v: 1, depth: 2, sign: 1 });

  try {
    const intervals = visible(new Vector3(0, 0, 0), new Vector3(10, 0, 0));

    expect(intervals[0]).toEqual({ start: 0, end: 0.2, hidden: false });
    expect(intervals.at(-1)).toMatchObject({ end: 1, hidden: false });
    expect(intervals.at(-1)!.start * 10).toBeCloseTo(8, 10);
    expect(
      intervals.filter((interval) => interval.hidden).reduce((sum, interval) => sum + interval.end - interval.start, 0),
    ).toBeCloseTo(0.6);
    expect(visible(new Vector3(0, 0, 2), new Vector3(10, 0, 2))).toEqual([{ start: 0, end: 1, hidden: false }]);
  } finally {
    solid.dispose();
    geometry.dispose();
  }
});

it.each([
  { u: 0, v: 1, depth: 2, sign: 1 },
  { u: 0, v: 2, depth: 1, sign: 1 },
  { u: 2, v: 1, depth: 0, sign: -1 },
])('clips sloped occlusion in both windings and edge directions for $depth depth', (axes) => {
  const point = (u: number, v: number, depth: number) =>
    new Vector3().setComponent(axes.u, u).setComponent(axes.v, v).setComponent(axes.depth, depth);
  const vertices = [point(2, -1, 0), point(8, -1, 2), point(2, 1, 0)];
  const a = point(0, 0, 0.5);
  const b = point(10, 0, 0.5);
  const start = (2 + 3 * (0.5 + DRAWING_LIMITS.toleranceMm)) / 10;

  for (const winding of [vertices, [...vertices].reverse()]) {
    const triangles = new Float32Array(winding.flatMap((vertex) => vertex.toArray()));
    const before = triangles.slice();
    const solid = new ShapeSolid(triangles);
    const visible = edgeVisibility(solid, axes);

    try {
      expect(visible(a, b)).toEqual([
        { start: 0, end: expect.closeTo(start, 14), hidden: false },
        { start: expect.closeTo(start, 14), end: 0.5, hidden: true },
        { start: 0.5, end: 1, hidden: false },
      ]);
      expect(visible(b, a)).toEqual([
        { start: 0, end: 0.5, hidden: false },
        { start: 0.5, end: expect.closeTo(1 - start, 14), hidden: true },
        { start: expect.closeTo(1 - start, 14), end: 1, hidden: false },
      ]);
      expect(triangles).toEqual(before);
    } finally {
      solid.dispose();
    }
  }
});
