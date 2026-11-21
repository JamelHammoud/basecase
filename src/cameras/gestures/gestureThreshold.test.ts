import { afterEach, describe, expect, it, vi } from 'vitest';
import { GESTURE_FEATURES, GESTURE_POINTS } from './gestureFrame';
import { bestMatch, frameGap, matchThreshold, type GestureExample } from './gestureMatch';

function matrixMatch(example: GestureExample, stream: GestureExample): number {
  const costs = Array.from({ length: stream.length + 1 }, () => new Array<number>(example.length + 1).fill(Infinity));
  let best = Infinity;

  for (const row of costs) row[0] = 0;

  for (let i = 1; i <= stream.length; i++) {
    for (let j = 1; j <= example.length; j++) {
      costs[i][j] =
        frameGap(stream[i - 1], example[j - 1]) + Math.min(costs[i - 1][j - 1], costs[i - 1][j], costs[i][j - 1]);
    }

    best = Math.min(best, costs[i][example.length] / example.length);
  }

  return best;
}

function referenceThreshold(examples: GestureExample[], match = matrixMatch): number {
  let spread = 0;

  for (const a of examples) for (const b of examples) if (a !== b) spread = Math.max(spread, match(a, b));

  return Math.max(0.12, spread * 1.8);
}

function example(seed: number, count: number): GestureExample {
  const special = [NaN, Infinity, -Infinity, -0, 1e-300];

  return Array.from({ length: count }, (_, frame) =>
    Array.from({ length: GESTURE_FEATURES }, (_, point) => {
      const choice = (seed * 7 + frame * 11 + point * 3) % 97;

      return choice < special.length ? special[choice] : Math.sin(seed + frame * 0.7 + point * 0.3);
    }),
  );
}

function freeze(examples: GestureExample[]): GestureExample[] {
  for (const entry of examples) {
    for (const frame of entry) Object.freeze(frame);

    Object.freeze(entry);
  }

  Object.freeze(examples);

  return examples;
}

describe('taught gesture threshold distances', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves both open-begin directions and the threshold floor', () => {
    const zero = new Array<number>(GESTURE_FEATURES).fill(0);
    const one = zero.map((_, i) => Number(i % 3 === 0));
    const a = [zero];
    const b = [zero, one];

    expect(matrixMatch(a, b)).toBe(0);
    expect(matrixMatch(b, a)).toBe(0.5);
    expect(matchThreshold([a, b])).toBeCloseTo(0.9, 14);
    expect(matchThreshold([b, a])).toBeCloseTo(0.9, 14);
    expect(matchThreshold([a, [zero]])).toBeCloseTo(0.12, 14);
    expect(matchThreshold([])).toBeCloseTo(0.12, 14);
    expect(matchThreshold([a])).toBeCloseTo(0.12, 14);
    expect(matchThreshold([a, a])).toBeCloseTo(0.12, 14);
  });

  it('matches full dynamic-programming tables across lengths, missing points and repeated references', () => {
    for (let seed = 0; seed < 120; seed++) {
      const examples = Array.from({ length: seed % 5 }, (_, i) => example(seed + i, (seed * 7 + i * 11) % 16));

      if (examples.length > 2) examples.push(examples[0]);

      freeze(examples);

      const expected = referenceThreshold(examples);

      expect(matchThreshold(examples)).toBe(expected);
      expect(matchThreshold([...examples].reverse())).toBe(expected);
    }
  });

  it('reads current examples after edits without retaining a pair cache', () => {
    const examples = [example(14, 12), example(15, 7), example(16, 19)];

    expect(matchThreshold(examples)).toBe(referenceThreshold(examples));
    examples[0][3].fill(10);
    examples[1].push(new Array<number>(GESTURE_FEATURES).fill(0));
    examples[2].splice(0, 4);
    expect(matchThreshold(examples)).toBe(referenceThreshold(examples));
  });

  it('preserves empty examples and sparse or entirely unseen landmark frames', () => {
    const sparse = new Array<number>(GESTURE_FEATURES);

    sparse[3] = 1;
    sparse[4] = 2;
    sparse[5] = 3;

    const unseen = new Array<number>(GESTURE_FEATURES).fill(NaN);
    const examples = [
      [sparse, unseen],
      [unseen, sparse, unseen],
    ];

    for (const entries of [examples, [[], ...examples], [[], []], [[]]]) {
      expect(matchThreshold(freeze(entries))).toBe(referenceThreshold(entries));
    }
  });

  it.each([30, 45])('halves landmark distances for three %i-frame teaching examples', (count) => {
    const examples = freeze([example(20, count), example(21, count), example(22, count)]);
    const hypot = vi.spyOn(Math, 'hypot');
    const expected = referenceThreshold(examples, bestMatch);
    const previousCalls = hypot.mock.calls.length;

    hypot.mockClear();

    const actual = matchThreshold(examples);
    const currentCalls = hypot.mock.calls.length;

    hypot.mockRestore();
    expect(actual).toBe(expected);
    expect(previousCalls).toBe(6 * count * count * GESTURE_POINTS.length);
    expect(currentCalls).toBe(3 * count * count * GESTURE_POINTS.length);
  });
});
