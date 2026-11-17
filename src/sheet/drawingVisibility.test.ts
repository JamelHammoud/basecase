import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { ShapeSolid } from '../three/analysis/shapeSolid';
import { edgeVisibility } from './drawingVisibility';

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
