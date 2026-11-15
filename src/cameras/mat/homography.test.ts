import { describe, expect, it } from 'vitest';
import { apply, fitHomography, invert, type PointPair, type Pt } from './homography';

const transform = [1.3, -0.2, 23, 0.4, 0.8, -41, 0.0002, -0.0003, 1];

function pairs(count: number, noise = 0): PointPair[] {
  return Array.from({ length: count }, (_, i) => {
    const from: Pt = [(i % 4) * 50 - 80, Math.floor(i / 4) * 40 - 60];
    const to = apply(transform, from);

    return { from, to: [to[0] + noise * Math.sin(i), to[1] + noise * Math.cos(i)] };
  });
}

describe('homography normal equations', () => {
  it.each([8, 16, 64])('recovers perspective and inverse projections from %i pairs', (count) => {
    const observations = pairs(count);
    const before = structuredClone(observations);
    const fitted = fitHomography(observations)!;
    const inverse = invert(fitted)!;

    for (const { from, to } of observations) {
      expect(apply(fitted, from)).toEqual(to.map((value) => expect.closeTo(value, 8)));
      expect(apply(inverse, to)).toEqual(from.map((value) => expect.closeTo(value, 8)));
    }

    expect(observations).toEqual(before);
    expect(fitHomography(observations)).toEqual(fitted);
  });

  it('fits noisy observations and reads edits without changing an earlier result', () => {
    const observations = pairs(64, 0.05);
    const fitted = fitHomography(observations)!;
    const before = [...fitted];

    for (const { from, to } of observations) {
      const projected = apply(fitted, from);

      expect(Math.hypot(projected[0] - to[0], projected[1] - to[1])).toBeLessThan(0.1);
      to[0] += 5;
    }

    const edited = fitHomography(observations)!;

    expect(edited).not.toEqual(fitted);
    expect(fitted).toEqual(before);
    expect(apply(edited, observations[0].from)[0] - apply(fitted, observations[0].from)[0]).toBeCloseTo(5, 8);
  });

  it('refuses too few pairs and singular point arrangements', () => {
    const line = pairs(4);

    expect(fitHomography(line.slice(0, 3))).toBeNull();
    expect(fitHomography(line)).toBeNull();
    expect(fitHomography(line.map(() => ({ from: [1, 1], to: [2, 2] })))).toBeNull();
  });
});
