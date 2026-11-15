import { describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../../utils/seededRandom';
import { averagePrecision } from './metricsPrecision';

type Match = { match: number };

function previousPrecision(matches: readonly Match[], support: number): number {
  let correct = 0;
  const curve = matches.map((item, index) => {
    correct += Number(item.match >= 0);

    return { recall: correct / support, precision: correct / (index + 1) };
  });
  const samples = Array.from({ length: 101 }, (_, index) =>
    curve.reduce((best, point) => (point.recall >= index / 100 ? Math.max(best, point.precision) : best), 0),
  );

  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

function sequence(bits: number, length: number): Match[] {
  return Array.from({ length }, (_, index) => ({ match: bits & (1 << index) ? index : -1 }));
}

describe('interpolated average precision', () => {
  it('matches every ranking through eight detections with missing ground truth', () => {
    for (let length = 0; length <= 8; length++) {
      for (let bits = 0; bits < 2 ** length; bits++) {
        const matches = sequence(bits, length);
        const correct = matches.filter((item) => item.match >= 0).length;

        for (const support of [Math.max(1, correct), correct + 1, correct + 7, 100]) {
          expect(averagePrecision(matches, support)).toBe(previousPrecision(matches, support));
        }
      }
    }
  });

  it('keeps exact recall boundaries, precision plateaus and input edits independent', () => {
    const matches = sequence(0b101101, 8);
    const original = structuredClone(matches);

    for (const support of [4, 5, 10, 20, 25, 50, 100, 101, 200]) {
      expect(averagePrecision(matches, support)).toBe(previousPrecision(matches, support));
    }

    expect(matches).toEqual(original);
    matches.reverse();
    matches[0].match = 0;
    expect(averagePrecision(matches, 7)).toBe(previousPrecision(matches, 7));
    expect(averagePrecision(original, 7)).toBe(previousPrecision(original, 7));
    expect(averagePrecision([], 1)).toBe(0);
    expect(averagePrecision(sequence(0, 8), 8)).toBe(0);
    expect(averagePrecision(sequence(255, 8), 8)).toBe(1);
  });

  it('matches longer generated rankings and frozen inputs', () => {
    const random = seededRandom('ad03e821d44568ff129b607c939373be');

    for (let trial = 0; trial < 80; trial++) {
      const matches = Object.freeze(
        Array.from({ length: 9 + Math.floor(random() * 600) }, (_, index) =>
          Object.freeze({ match: random() < 0.6 ? index : -1 }),
        ),
      );
      const support = matches.filter((item) => item.match >= 0).length + 1 + Math.floor(random() * 300);

      expect(averagePrecision(matches, support)).toBe(previousPrecision(matches, support));
    }
  });

  it.each([
    { length: 300, comparisons: 15200 },
    { length: 600, comparisons: 30400 },
  ])('compares each precision candidate once for $length detections', ({ length, comparisons }) => {
    const matches = Array.from({ length }, (_, index) => ({ match: index % 2 ? index : -1 }));
    const maximum = vi.spyOn(Math, 'max');
    let previous: number;
    let current: number;
    let before: number;
    let after: number;

    try {
      previous = previousPrecision(matches, length / 2);
      before = maximum.mock.calls.length;
      maximum.mockClear();
      current = averagePrecision(matches, length / 2);
      after = maximum.mock.calls.length;
    } finally {
      maximum.mockRestore();
    }

    expect(current).toBe(previous);
    expect(before).toBe(comparisons);
    expect(after).toBe(length);
  });
});
