import { describe, expect, it, vi } from 'vitest';
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

const copyPoint = (point: Point2, out: Point2): void => {
  out[0] = point[0];
  out[1] = point[1];
};

function previousDistance([px, py]: Point2, points: Point2[]): number {
  let best = Infinity;

  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;

    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }

  return best;
}

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

    expect(distanceToPolyline([140, 100], loop, copyPoint)).toBeLessThan(1);
    expect(distanceToPolyline([100, 100], loop, copyPoint)).toBeCloseTo(40, 0);
    expect(distanceToPolyline([0, 0], [[0, 0]], copyPoint)).toBe(Infinity);
  });

  it('projects each point once through two reusable endpoints', () => {
    for (const count of [400, 800]) {
      const points = Array.from({ length: count }, (_, i) => ({ x: i, y: 20 }));
      const endpoints = new Set<Point2>();
      let projections = 0;
      const project = (point: (typeof points)[number], out: Point2): void => {
        endpoints.add(out);
        projections++;
        out[0] = point.x;
        out[1] = point.y;
      };

      expect(distanceToPolyline([100, 30], points, project)).toBe(10);
      expect(projections).toBe(count);
      expect(endpoints.size).toBe(2);
      expect(distanceToPolyline([100, 30], [], project)).toBe(Infinity);
      expect(projections).toBe(count);
    }
  });

  it('keeps repeated endpoints and reads subsequent point edits', () => {
    const points: Point2[] = [
      [0, 0],
      [0, 0],
      [100, 0],
    ];

    expect(distanceToPolyline([0, 10], points, copyPoint)).toBe(10);
    expect(distanceToPolyline([110, 0], points, copyPoint)).toBe(10);
    points[2] = [200, 0];
    expect(distanceToPolyline([110, 0], points, copyPoint)).toBeCloseTo(0, 12);
  });

  it('measures diagonal projections, endpoint clamps and the nearest segment in either direction', () => {
    const points: Point2[] = [
      [0, 0],
      [10, 10],
      [10, 30],
    ];
    const cases: Array<[Point2, number]> = [
      [[4, 6], Math.SQRT2],
      [[-3, -4], 5],
      [[13, 34], 5],
      [[13, 20], 3],
      [[10, 10], 0],
    ];

    for (const [point, expected] of cases) {
      expect(distanceToPolyline(point, points, copyPoint)).toBeCloseTo(expected, 12);
      expect(distanceToPolyline(point, points.toReversed(), copyPoint)).toBeCloseTo(expected, 12);
    }
  });

  it('records the camera direction a mark was drawn from as a look view', () => {
    expect(viewAngles([0, 0, 1])).toBe('az:0,el:0');
    expect(viewAngles([1, 0, 0])).toBe('az:90,el:0');
    expect(viewAngles([0, 1, 1])).toBe('az:0,el:45');
  });
});

describe('mark segment distance bounds', () => {
  it('preserves exact distances across segment directions, scales and nonfinite projections', () => {
    const points: Point2[] = Array.from({ length: 400 }, (_, i) => [
      Math.sin(i * 7.3) * 2000,
      Math.cos(i * 3.1) * 1000,
    ]);
    const strokes: Point2[][] = [
      points,
      [...points].reverse(),
      [[0, 0]],
      [],
      [
        [0, 0],
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      [
        [1e-200, 0],
        [1e-200, 0],
      ],
      [
        [1e200, 0],
        [1e200, 0],
      ],
      [
        [2e-200, 0],
        [1e-200, 0],
      ],
      [
        [2e200, 0],
        [1e200, 0],
      ],
      [
        [1, 1],
        [1, 1 + Number.EPSILON],
        [1, 1],
      ],
      [
        [0, 0],
        [Infinity, NaN],
        [0, 0],
      ],
    ];

    for (const stroke of strokes) {
      for (const point of [
        [0, 0],
        [0, 10],
        [6, 8],
        [2000, -1000],
      ] satisfies Point2[]) {
        expect(distanceToPolyline(point, stroke, copyPoint)).toBe(previousDistance(point, stroke));
      }
    }
  });

  it('normalizes once for distant segments and successively closer segments', () => {
    const hypot = vi.spyOn(Math, 'hypot');

    try {
      for (const count of [400, 800]) {
        const points: Point2[] = Array.from({ length: count }, (_, i) => [i, 0]);

        hypot.mockClear();
        expect(distanceToPolyline([0, 10], points, copyPoint)).toBe(10);
        expect(hypot).toHaveBeenCalledTimes(1);
        hypot.mockClear();
        expect(distanceToPolyline([0, 10], points.toReversed(), copyPoint)).toBe(10);
        expect(hypot).toHaveBeenCalledTimes(1);
      }
    } finally {
      hypot.mockRestore();
    }
  });
});
