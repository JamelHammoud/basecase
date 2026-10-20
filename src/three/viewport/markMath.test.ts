import { describe, expect, it } from 'vitest';
import {
  distanceToPolyline,
  encloses,
  pointInPolygon,
  strokeLength,
  thinned,
  viewAngles,
  type Point2,
} from './markMath';

const circle = (r: number, n = 32, sweep = 1): Point2[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / (n - 1)) * Math.PI * 2 * sweep;

    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
  });

describe('mark strokes', () => {
  it('tells a loop that circles something from a line', () => {
    expect(encloses(circle(40))).toBe(true);
    expect(encloses(circle(40, 32, 0.85))).toBe(true);
    expect(encloses(circle(40, 32, 0.4))).toBe(false);
    expect(
      encloses([
        [0, 0],
        [50, 2],
        [100, 0],
      ]),
    ).toBe(false);
  });

  it('finds what a loop surrounds', () => {
    const loop = circle(40);

    expect(pointInPolygon([100, 100], loop)).toBe(true);
    expect(pointInPolygon([150, 100], loop)).toBe(false);
  });

  it('measures and thins long strokes evenly', () => {
    const line: Point2[] = Array.from({ length: 1001 }, (_, i) => [i, 0]);
    const kept = thinned(line, 11);

    expect(strokeLength(line)).toBe(1000);
    expect(kept).toHaveLength(11);
    expect(kept[0]).toEqual([0, 0]);
    expect(kept[10]).toEqual([1000, 0]);
    expect(kept[5]).toEqual([500, 0]);
  });

  it('finds how close a click is to a drawn stroke', () => {
    const loop = circle(40);

    expect(distanceToPolyline([140, 100], loop)).toBeLessThan(1);
    expect(distanceToPolyline([100, 100], loop)).toBeCloseTo(40, 0);
    expect(distanceToPolyline([0, 0], [[0, 0]])).toBe(Infinity);
  });

  it('records the camera direction a mark was drawn from as a look view', () => {
    expect(viewAngles([0, 0, 1])).toBe('az:0,el:0');
    expect(viewAngles([1, 0, 0])).toBe('az:90,el:0');
    expect(viewAngles([0, 1, 1])).toBe('az:0,el:45');
  });
});
