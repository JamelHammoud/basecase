import { describe, expect, it } from 'vitest';
import { detectUnit, mergedSpans, RADIAN_LIMIT, type ColumnSpan } from './units';

function previousMerge(all: ColumnSpan[][]): ColumnSpan[] {
  return Array.from({ length: all[0]?.length ?? 0 }, (_, c) => ({
    lo: Math.min(...all.map((spans) => spans[c].lo)),
    hi: Math.max(...all.map((spans) => spans[c].hi)),
  }));
}

function previousUnit(spans: ColumnSpan[]) {
  const known = spans.filter((span) => span.lo <= span.hi);

  if (!known.length) return 'rad';

  const lo = Math.min(...known.map((span) => span.lo));
  const hi = Math.max(...known.map((span) => span.hi));

  if (Math.max(-lo, hi) <= RADIAN_LIMIT) return 'rad';

  if (lo >= -360 && hi <= 360) return 'deg';

  return lo >= 0 && hi < 4096 ? 'counts' : null;
}

describe('imported joint ranges', () => {
  it.each([false, true])('preserves merged ranges and inputs with nonfinite values: %s', (nonfinite) => {
    const values = [-Infinity, -5000, -360, -RADIAN_LIMIT, -0, 0, RADIAN_LIMIT, 360, 4095, 4096, Infinity, NaN];

    const pool = nonfinite ? values : values.filter(Number.isFinite);

    for (let offset = 0; offset < pool.length; offset++) {
      const episodes = Array.from({ length: 80 }, (_, e) =>
        Array.from({ length: 12 }, (_, c) => ({
          lo: pool[(offset + e + c) % pool.length],
          hi: pool[(offset + e * 3 + c) % pool.length],
        })),
      );
      const before = structuredClone(episodes);
      const expected = previousMerge(episodes);
      const actual = mergedSpans(episodes);

      expect(actual).toEqual(expected);
      expect(detectUnit(actual)).toBe(previousUnit(expected));
      expect(episodes).toEqual(before);

      for (const spans of episodes) expect(detectUnit(spans)).toBe(previousUnit(spans));
    }
  });

  it('keeps empty ranges and inclusive unit thresholds', () => {
    expect(mergedSpans([])).toEqual([]);
    expect(mergedSpans([[], []])).toEqual([]);
    expect(detectUnit([])).toBe('rad');
    expect(detectUnit([{ lo: Infinity, hi: -Infinity }])).toBe('rad');

    for (const [lo, hi, unit] of [
      [-RADIAN_LIMIT, RADIAN_LIMIT, 'rad'],
      [-360, 360, 'deg'],
      [0, 4095, 'counts'],
      [0, 4096, null],
      [-1, 4095, null],
    ] as const) {
      expect(
        detectUnit([
          { lo, hi },
          { lo: NaN, hi: NaN },
        ]),
      ).toBe(unit);
    }
  });
});
