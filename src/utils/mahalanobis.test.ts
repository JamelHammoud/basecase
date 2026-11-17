import { describe, expect, it } from 'vitest';
import { mahalanobis, type Matrix } from './gaussian';
import { seededRandom } from './seededRandom';

function reference(lower: Matrix, offset: readonly number[]): number {
  const solved: number[] = [];

  for (let i = 0; i < offset.length; i++) {
    let sum = offset[i];

    for (let k = 0; k < i; k++) sum -= lower[i][k] * solved[k];

    solved.push(sum / lower[i][i]);
  }

  return solved.reduce((sum, value) => sum + value * value, 0);
}

describe('Mahalanobis distance', () => {
  it('matches the separate norm pass exactly across dimensions and later edits', () => {
    const random = seededRandom('0123456789abcdef0123456789abcdef');
    const value = () => (random() - 0.5) * 10;

    for (let trial = 0; trial < 160; trial++) {
      const size = trial % 16;
      const lower = Array.from({ length: size }, (_, i) =>
        Array.from({ length: size }, (_, j) => (i === j ? random() + 0.1 : value())),
      );
      const offset = Array.from({ length: size }, value);

      expect(mahalanobis(lower, offset)).toBe(reference(lower, offset));

      if (size) offset[0] = value();

      if (size) lower[0][0] += 1;

      lower.forEach(Object.freeze);
      Object.freeze(offset);
      expect(mahalanobis(lower, offset)).toBe(reference(lower, offset));
    }
  });

  it('preserves zero, singular and nonfinite arithmetic', () => {
    for (const diagonal of [0, -0, 1, -1, Number.MIN_VALUE, Infinity, -Infinity, NaN]) {
      for (const value of [0, -0, 2, Number.MAX_VALUE, Infinity, -Infinity, NaN]) {
        const lower = [
          [diagonal, 0],
          [value, diagonal],
        ];
        const offset = [value, -value];

        expect(mahalanobis(lower, offset)).toBe(reference(lower, offset));
      }
    }

    expect(mahalanobis([], [])).toBe(0);
    expect(mahalanobis([[1]], [-0])).toBe(0);
  });
});
