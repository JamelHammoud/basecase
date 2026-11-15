import { describe, expect, it } from 'vitest';
import type { Rect } from './bed';
import { packSpot } from './packSpot';

function previousSpot(free: Rect[], w: number, d: number) {
  const best = (width: number, depth: number) => {
    let found: { rect: Rect; score: number } | null = null;

    for (const rect of free) {
      if (width > rect.w + 1e-6 || depth > rect.d + 1e-6) continue;

      const score = Math.min(rect.w - width, rect.d - depth) * 1e6 + rect.y * 1e3 + rect.x;

      if (!found || score < found.score) found = { rect: { x: rect.x, y: rect.y, w: width, d: depth }, score };
    }

    return found;
  };
  const options = [
    { yaw: 0, spot: best(w, d) },
    { yaw: 90, spot: best(d, w) },
  ];
  const found = options.filter((option) => option.spot).sort((a, b) => a.spot!.score - b.spot!.score)[0];

  return found ? { rect: found.spot!.rect, yaw: found.yaw } : null;
}

describe('plate packing spot selection', () => {
  it('keeps the first rectangle and the straight orientation on equal scores', () => {
    const free = [
      { x: 1, y: 0, w: 20, d: 30 },
      { x: 0, y: 0.001, w: 30, d: 20 },
    ];

    expect(packSpot(free, 20, 30)).toEqual({ rect: free[0], yaw: 0 });
    expect(packSpot(free.toReversed(), 20, 20)).toEqual({ rect: { ...free[1], w: 20, d: 20 }, yaw: 0 });
  });

  it('turns a part when only the rotated footprint fits and refuses a full plate', () => {
    const free = [{ x: 7, y: 9, w: 30, d: 20 }];

    expect(packSpot(free, 20, 30)).toEqual({ rect: free[0], yaw: 90 });
    expect(packSpot(free, 31, 31)).toBeNull();
    expect(packSpot([], 1, 1)).toBeNull();
    expect(packSpot(free, 30 + 5e-7, 20)).not.toBeNull();
    expect(packSpot(free, 30 + 2e-6, 20)).toBeNull();
  });

  it('matches separate orientation scans across mixed free spaces and dimensions', () => {
    let seed = 9407;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return seed / 2 ** 32;
    };

    for (let trial = 0; trial < 300; trial++) {
      const free = Array.from({ length: trial % 37 }, () => ({
        x: random() * 250,
        y: random() * 250,
        w: random() * 100,
        d: random() * 100,
      }));
      const snapshot = structuredClone(free);

      for (let query = 0; query < 8; query++) {
        const w = random() * 120;
        const d = random() * 120;

        expect(packSpot(free, w, d)).toEqual(previousSpot(free, w, d));
      }

      expect(free).toEqual(snapshot);
    }
  });

  it('retains comparisons for zero, nonfinite and tolerance-boundary values', () => {
    const values = [0, 1e-6, 20 - 1e-6, 20, 20 + 1e-6, 20 + 2e-6, Infinity, -Infinity, NaN];
    const free = [
      { x: 0, y: 0, w: 20, d: 30 },
      { x: 10, y: 10, w: 30, d: 20 },
      { x: 1, y: 1, w: Infinity, d: 40 },
      { x: NaN, y: 0, w: 50, d: 50 },
    ];

    for (const w of values) for (const d of values) expect(packSpot(free, w, d)).toEqual(previousSpot(free, w, d));
  });

  it('reads edits afresh and returns rectangles independent of sources and earlier results', () => {
    const free = [{ x: 4, y: 8, w: 50, d: 60 }];
    const first = packSpot(free, 20, 30)!;

    expect(first.rect).not.toBe(free[0]);
    free[0].x = 12;
    first.rect.w = 99;
    expect(packSpot(free, 20, 30)).toEqual({ rect: { x: 12, y: 8, w: 30, d: 20 }, yaw: 90 });
    expect(first.rect.x).toBe(4);
    expect(free[0].w).toBe(50);
  });

  it.each([300, 600])('visits %i free rectangles once for both orientations', (count) => {
    let visits = 0;
    const free = Array.from({ length: count }, (_, i) => ({ x: i, y: 0, w: 100, d: 100 }));
    const tracked = new Proxy(free, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) visits++;

        return Reflect.get(target, property, receiver);
      },
    });
    const expected = previousSpot(tracked, 20, 30);

    expect(visits).toBe(count * 2);
    visits = 0;
    expect(packSpot(tracked, 20, 30)).toEqual(expected);
    expect(visits).toBe(count);
  });
});
