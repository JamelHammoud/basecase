import { describe, expect, it } from 'vitest';
import type { Point2 } from '../data/printers';
import { fitOnBed, type Bed } from './bed';
import { bedProjection, bedSeparated } from './bedProjection';

function previousSeparated(first: Point2[], second: Point2[]): boolean {
  const axes = (poly: Point2[]): Point2[] =>
    poly.map((p, i) => {
      const q = poly[(i + 1) % poly.length];

      return [q[1] - p[1], p[0] - q[0]];
    });

  return [...axes(first), ...axes(second)].some(([x, y]) => {
    const pa = first.map((p) => p[0] * x + p[1] * y);
    const pb = second.map((p) => p[0] * x + p[1] * y);

    return Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6;
  });
}

function rectangle(x: number, y: number, size: Point2, angle = 0): Point2[] {
  const [w, d] = size;
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return [
    [0, 0],
    [w, 0],
    [w, d],
    [0, d],
  ].map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
}

const bed = (keepOut: Bed['keepOut'] = []): Bed => ({
  name: 'Square',
  width: 100,
  depth: 100,
  height: 100,
  origin: [0, 0],
  keepOut,
});

describe('diagonal bed projections', () => {
  it('matches direct separating-axis projections across rotated, reflected and collapsed rectangles', () => {
    let seed = 4102;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return seed / 2 ** 32;
    };

    for (let trial = 0; trial < 500; trial++) {
      const a = rectangle(random() * 100, random() * 100, [random() * 120, random() * 80], random() * 7);
      const b = rectangle(random() * 100, random() * 100, [random() * 120, random() * 80], random() * 7);
      const snapshot = structuredClone([a, b]);
      const pa = bedProjection(a);
      const pb = bedProjection(b);

      for (const points of [b, b.toReversed(), b.map(([x, y]): Point2 => [-x, y]), rectangle(0, 0, [0, 0])]) {
        expect(bedSeparated(pa, bedProjection(points))).toBe(previousSeparated(a, points));
      }

      expect(bedSeparated(pa, pb)).toBe(previousSeparated(a, b));
      expect(bedSeparated(pb, pa)).toBe(previousSeparated(b, a));
      expect([a, b]).toEqual(snapshot);
    }
  });

  it('preserves touching, tolerance, signed zero and nonfinite projections', () => {
    const a = rectangle(0, 0, [10, 10]);
    const pa = bedProjection(a);

    for (const x of [0, -0, 10 - 2e-7, 10 - 5e-8, 10, 10 + 1e-6, Infinity, -Infinity, NaN]) {
      const b = rectangle(x, 0, [10, 10]);

      expect(bedSeparated(pa, bedProjection(b))).toBe(previousSeparated(a, b));
      expect(bedSeparated(bedProjection(b), pa)).toBe(previousSeparated(b, a));
    }

    expect(bedSeparated(pa, bedProjection(rectangle(10, 0, [10, 10])))).toBe(true);
    expect(bedSeparated(pa, bedProjection(rectangle(10 - 2e-7, 0, [10, 10])))).toBe(false);
    expect(bedSeparated(pa, bedProjection(rectangle(10 - 5e-8, 0, [10, 10])))).toBe(true);
  });

  it('keeps the first fitting angle and reads changed beds on each fit', () => {
    const source = bed();

    expect(fitOnBed(110, 10, 5, source)).toEqual({ yaw: 35, spot: null });
    expect(fitOnBed(110, 10, 101, source)).toBeNull();
    expect(fitOnBed(150, 10, 5, source)).toBeNull();
    source.keepOut.push({ x: 45, y: 45, w: 10, d: 10 });
    expect(fitOnBed(110, 10, 5, source)).toBeNull();
    source.keepOut[0].x = 0;
    source.keepOut[0].y = 90;
    expect(fitOnBed(110, 10, 5, source)).toEqual({ yaw: 35, spot: null });
    expect(fitOnBed(10, 10, 5, source)).toEqual({ yaw: 0, spot: { x: 0, y: 0, w: 10, d: 10 } });
    expect(fitOnBed(110, 10, 5, bed([{ x: 0, y: 90, w: 10, d: 10 }]))).toEqual({ yaw: 35, spot: null });
  });

  it.each([300, 600])('shares two angle projections across %i keep-outs', (count) => {
    let reads = 0;
    const tracked = (points: Point2[]) =>
      points.map(
        (point) =>
          new Proxy(point, {
            get(target, property, receiver) {
              if (property === '0' || property === '1') reads++;

              return Reflect.get(target, property, receiver);
            },
          }),
      );
    const footprints = [tracked(rectangle(0, 0, [10, 10])), tracked(rectangle(0, 0, [10, 10], 0.2))];
    const obstacles = Array.from({ length: count }, (_, i) => tracked(rectangle(1 + i * 1e-6, 1, [10, 10])));

    for (const footprint of footprints)
      for (const obstacle of obstacles) expect(previousSeparated(footprint, obstacle)).toBe(false);

    expect(reads).toBe(count * 320);
    reads = 0;

    const preparedFootprints = footprints.map(bedProjection);
    const preparedObstacles = obstacles.map(bedProjection);

    for (const footprint of preparedFootprints)
      for (const obstacle of preparedObstacles) expect(bedSeparated(footprint, obstacle)).toBe(false);

    expect(reads).toBe(96 + count * 176);
  });
});
