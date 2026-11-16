import { afterEach, describe, expect, it, vi } from 'vitest';
import { synthesizeFourBar } from './linkage';
import * as kinematics from './linkageKinematics';
import { seededRandom } from './seededRandom';
import type { Vec2 } from './linkageKinematics';

function referenceSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;

  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function referenceDistance(p: Vec2, curve: Vec2[]): number {
  if (curve.length === 1) return Math.hypot(p[0] - curve[0][0], p[1] - curve[0][1]);

  let best = Infinity;

  for (let i = 1; i < curve.length; i++) best = Math.min(best, referenceSegment(p, curve[i - 1], curve[i]));

  return best;
}

function countedCurve(points: Vec2[]) {
  let reads = 0;
  const curve = points.map(
    (point) =>
      new Proxy(point, {
        get(target, key, receiver) {
          if (key === '0' || key === '1') reads++;

          return Reflect.get(target, key, receiver);
        },
      }),
  );

  return { curve, reads: () => reads };
}

afterEach(() => vi.restoreAllMocks());

describe('nearest four-bar segment distances', () => {
  it.each([360, 720])('normalizes only the nearest of %d ordinary segments', (segments) => {
    const curve = Array.from({ length: segments + 1 }, (_, i): Vec2 => [i, 0]);
    const distance = kinematics.curveDistance(curve);
    const point: Vec2 = [segments + 20, 3];
    const expected = referenceDistance(point, curve);
    const hypot = vi.spyOn(Math, 'hypot');

    expect(distance(point)).toBe(expected);
    expect(hypot).toHaveBeenCalledTimes(1);
  });

  it('retains the hypot minimum when distinct squared distances round in the opposite order', () => {
    const a: Vec2 = [0.9999999999995, 9.999999999998333e-7];
    const b: Vec2 = [0.9999999998195, 0.000018999999998856832];
    const curve: Vec2[] = [a, [2 * a[0], 2 * a[1]], [2 * b[0], 2 * b[1]], b];
    const point: Vec2 = [0, 0];

    expect(a[0] * a[0] + a[1] * a[1]).toBeLessThan(b[0] * b[0] + b[1] * b[1]);
    expect(Math.hypot(...a)).toBeGreaterThan(Math.hypot(...b));

    for (const scale of [1e-149, 1e-100, 1, 1e100, 1e149]) {
      const scaled = curve.map(([x, y]): Vec2 => [x * scale, y * scale]);

      for (const ordered of [scaled, scaled.toReversed()])
        expect(kinematics.curveDistance(ordered)(point)).toBe(referenceDistance(point, ordered));
    }
  });

  it('retains hypot arithmetic for squared-distance ties and extreme residuals', () => {
    const curves: Vec2[][] = [
      [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      [
        [0, 0],
        [1e-160, 0],
      ],
    ];
    const points: Vec2[] = [
      [1, 1],
      [0, 1e-160],
      [1e200, 1e200],
      [NaN, 0],
      [Infinity, 0],
    ];

    for (const curve of curves) {
      const distance = kinematics.curveDistance(curve);

      for (const point of points) expect(distance(point)).toBe(referenceDistance(point, curve));
    }
  });
});

describe('prepared four-bar curve distances', () => {
  it('matches segment scans exactly across seeded curves and queries', () => {
    const random = seededRandom('123456789abcdef00123456789abcdef');
    const point = (): Vec2 => [(random() - 0.5) * 1000, (random() - 0.5) * 1000];

    for (let trial = 0; trial < 100; trial++) {
      const curve = Array.from({ length: trial % 25 }, point);
      const saved = structuredClone(curve);
      const distance = kinematics.curveDistance(curve);
      const queries = [...curve, ...Array.from({ length: 20 }, point)];

      for (const query of queries) expect(distance(query)).toBe(referenceDistance(query, curve));

      expect(curve).toEqual(saved);
    }
  });

  it.each<Vec2[]>([
    [],
    [[3, -2]],
    [
      [0, 0],
      [0, 0],
      [4, 0],
      [4, 0],
    ],
    [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 0],
    ],
    [
      [0, 0],
      [1e-150, 1e-150],
    ],
    [
      [-1e150, 0],
      [1e150, 1e150],
    ],
    [
      [0, 0],
      [Number.NaN, 1],
    ],
    [
      [Infinity, 0],
      [0, -Infinity],
    ],
  ])('keeps degenerate and non-finite results for curve %j', (...curve) => {
    const distance = kinematics.curveDistance(curve);
    const queries: Vec2[] = [
      [0, 0],
      [-1, 0],
      [2, 2],
      [8, -3],
      [Number.NaN, 0],
      [Infinity, 1],
    ];

    for (const query of queries) expect(distance(query)).toBe(referenceDistance(query, curve));
  });

  it.each([360, 720])('reads a %d-segment curve only during preparation', (segments) => {
    const source = Array.from({ length: segments + 1 }, (_, i): Vec2 => [i / 3, Math.sin(i)]);
    const counted = countedCurve(source);
    const distance = kinematics.curveDistance(counted.curve);
    const preparedReads = counted.reads();
    const queries = Array.from({ length: 12 }, (_, i): Vec2 => [i * 7.3, -i * 0.9]);
    const actual = queries.map(distance);

    expect(preparedReads).toBe(4 * segments);
    expect(counted.reads()).toBe(preparedReads);
    expect(actual).toEqual(queries.map((point) => referenceDistance(point, counted.curve)));
    expect(counted.reads() - preparedReads).toBe(8 * segments * queries.length);
    expect(source).toEqual(Array.from({ length: segments + 1 }, (_, i): Vec2 => [i / 3, Math.sin(i)]));
  });

  it('prepares edits afresh without changing earlier prepared curves', () => {
    const curve: Vec2[] = [
      [0, 0],
      [4, 0],
      [4, 3],
    ];
    const before = structuredClone(curve);
    const first = kinematics.curveDistance(curve);

    curve[1][1] = 8;
    curve.push([12, -3]);

    const changed = kinematics.curveDistance(curve);
    const point: Vec2 = [4, 0];

    expect(first(point)).toBe(referenceDistance(point, before));
    expect(changed(point)).toBe(referenceDistance(point, curve));
    expect(changed(point)).not.toBe(first(point));
    expect(kinematics.curveDistance(before)(point)).toBe(first(point));
  });

  it('preserves complete fit results and ranking through both distance consumers', () => {
    const points: Vec2[] = [
      [0, 0],
      [20, 0],
      [40, 0],
      [60, 0],
      [80, 0],
    ];
    const saved = structuredClone(points);
    const reference = vi
      .spyOn(kinematics, 'curveDistance')
      .mockImplementation((curve) => (point) => referenceDistance(point, curve));
    const expected = synthesizeFourBar(points);

    expect(expected).toHaveLength(3);
    expect(reference).toHaveBeenCalledTimes(73);
    reference.mockRestore();

    const prepared = vi.spyOn(kinematics, 'curveDistance');

    expect(synthesizeFourBar(points)).toEqual(expected);
    expect(prepared).toHaveBeenCalledTimes(73);
    expect(prepared.mock.calls.filter(([curve]) => curve === points)).toHaveLength(1);
    expect(points).toEqual(saved);
  });
});
