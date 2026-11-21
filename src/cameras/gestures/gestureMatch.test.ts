import { describe, expect, it } from 'vitest';
import { GESTURE_FEATURES } from './gestureFrame';
import { bestMatch, frameGap, SpringMatch, type GestureExample } from './gestureMatch';

function matrixScores(example: GestureExample, stream: GestureExample): number[] {
  const table = Array.from({ length: stream.length + 1 }, () => new Array<number>(example.length + 1).fill(Infinity));

  for (const row of table) row[0] = 0;

  for (let i = 1; i <= stream.length; i++) {
    for (let j = 1; j <= example.length; j++) {
      table[i][j] =
        frameGap(stream[i - 1], example[j - 1]) + Math.min(table[i - 1][j - 1], table[i - 1][j], table[i][j - 1]);
    }
  }

  return table.slice(1).map((row) => row[example.length] / example.length);
}

function sequence(seed: number, count: number): GestureExample {
  return Array.from({ length: count }, (_, frame) =>
    Array.from({ length: GESTURE_FEATURES }, (_, point) => {
      const value = Math.sin(seed + frame * 0.7 + point * 0.3);

      return (seed + frame * 3 + point) % 17 === 0 ? NaN : value;
    }),
  );
}

describe('streaming gesture matching', () => {
  it('preserves every dynamic-programming score across unequal lengths and missing landmarks', () => {
    for (let seed = 0; seed < 120; seed++) {
      const example = sequence(seed, seed % 46);
      const stream = sequence(seed + 5, (seed * 11) % 91);
      const expected = matrixScores(example, stream);
      const match = new SpringMatch(example);

      for (const frame of example) Object.freeze(frame);

      Object.freeze(example);
      expect(stream.map((frame) => match.step(frame))).toEqual(expected);
      expect(bestMatch(example, stream)).toBe(Math.min(...expected));
    }
  });

  it('keeps independent match histories and accepts an exact match after an unrelated prefix', () => {
    const example = sequence(14, 45);
    const prefix = sequence(37, 100);
    const stream = [...prefix, ...example, ...example];
    const expected = matrixScores(example, stream);
    const exact = matrixScores(example, example);
    const first = new SpringMatch(example);
    const second = new SpringMatch(example);

    for (let i = 0; i < stream.length; i++) {
      expect(first.step(stream[i])).toBe(expected[i]);

      if (i < example.length) expect(second.step(example[i])).toBe(exact[i]);
    }

    expect(expected[prefix.length + example.length - 1]).toBe(0);
    expect(exact[example.length - 1]).toBe(0);
  });

  it('preserves empty examples, unseen points and overflowing distances', () => {
    const unseen = new Array<number>(GESTURE_FEATURES).fill(NaN);
    const large = new Array<number>(GESTURE_FEATURES).fill(1e308);
    const negative = large.map((value) => -value);
    const sparse = new Array<number>(GESTURE_FEATURES);
    const stream = [unseen, large, negative, sparse];

    for (const example of [[], [unseen], [large, negative], [sparse, unseen]]) {
      const match = new SpringMatch(example);

      expect(stream.map((frame) => match.step(frame))).toEqual(matrixScores(example, stream));
    }
  });
});
