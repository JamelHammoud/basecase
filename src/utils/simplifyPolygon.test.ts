import { describe, expect, it, vi } from 'vitest';
import { simplifyPolygon } from './simplifyPolygon';

type Point = [number, number];

function previousDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);

  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));

  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function previousSimplification(points: Point[], epsilon: number): Point[] {
  if (points.length <= 4) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const dist = previousDistance(points[i], points[0], points[end]);

    if (dist > dmax) {
      index = i;
      dmax = dist;
    }
  }

  if (dmax <= epsilon) return [points[0], points[end]];

  const rec1 = previousSimplification(points.slice(0, index + 1), epsilon);
  const rec2 = previousSimplification(points.slice(index), epsilon);

  return rec1.slice(0, rec1.length - 1).concat(rec2);
}

function outline(count: number, seed: number): Point[] {
  const points = Array.from({ length: count }, (_, i): Point => {
    const theta = (i / count) * Math.PI * 2;
    const radius = 0.3 + 0.15 * Math.sin(i * (seed + 1));

    return [Math.round(Math.cos(theta) * radius * 1000) / 1000, Math.round(Math.sin(theta) * radius * 1000) / 1000];
  });

  return count ? [...points, points[0]] : points;
}

function copiedArrays(run: () => Point[]) {
  const slices = vi.spyOn(Array.prototype, 'slice');
  const concats = vi.spyOn(Array.prototype, 'concat');

  try {
    const result = run();

    return { result, slices: slices.mock.calls.length, concats: concats.mock.calls.length };
  } finally {
    slices.mockRestore();
    concats.mockRestore();
  }
}

function expectPreviousSelection(points: Point[]) {
  const saved = structuredClone(points);

  points.forEach(Object.freeze);
  Object.freeze(points);

  for (const epsilon of [0, 0.001, 0.022, 0.1, 1]) {
    const expected = previousSimplification(points, epsilon);
    const actual = simplifyPolygon(points, epsilon);

    expect(actual).toEqual(expected);
    actual.forEach((point, index) => expect(point).toBe(expected[index]));
  }

  expect(points).toEqual(saved);
}

describe('photo outline simplification', () => {
  it('matches previous selections and point references across open, closed and reflected outlines', () => {
    for (let seed = 0; seed < 12; seed++) {
      for (const count of [0, 1, 2, 3, 4, 5, 8, 24, 48, 96]) {
        const closed = outline(count, seed);
        const reflected = closed.map(([x, y]): Point => [-x + 2, y - 3]);

        for (const points of [closed, closed.slice(0, -1), reflected]) expectPreviousSelection(points);
      }
    }
  });

  it('preserves the four-point cutoff, tied splits and exact tolerance boundary', () => {
    const points: Point[] = [
      [0, 0],
      [1, 1],
      [2, 1],
      [3, 0],
      [4, 0],
    ];

    expect(simplifyPolygon(points.slice(0, 4), 100)).toEqual(points.slice(0, 4));
    expect(simplifyPolygon(points, 1)).toEqual([points[0], points[4]]);
    expect(simplifyPolygon(points, 1 - Number.EPSILON)).toEqual(points);

    for (const sample of [Array<Point>(12).fill([2, 3]), [...points, points[0]], [[NaN, 0], ...points]]) {
      expect(simplifyPolygon(sample as Point[], 0.022)).toEqual(previousSimplification(sample as Point[], 0.022));
    }
  });

  it('reads later edits and keeps separate output arrays', () => {
    const points = outline(48, 2);
    const first = simplifyPolygon(points, 0.022);
    const saved = [...first];

    points[12] = [5, 7];

    const edited = simplifyPolygon(points, 0.022);

    expect(edited).toEqual(previousSimplification(points, 0.022));
    expect(edited).not.toBe(first);
    expect(first).toEqual(saved);
    expect(edited).toContain(points[12]);
  });

  it('removes recursive array copying at the photo sampler’s full resolution', () => {
    const points = outline(48, 3);
    const before = copiedArrays(() => previousSimplification(points, 0.022));
    const after = copiedArrays(() => simplifyPolygon(points, 0.022));

    expect(after.result).toEqual(before.result);
    expect(before.slices).toBe(75);
    expect(before.concats).toBe(25);
    expect(after.slices).toBe(0);
    expect(after.concats).toBe(0);
  });
});
