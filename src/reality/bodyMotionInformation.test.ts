import { describe, expect, it } from 'vitest';
import { bodySensitivity } from './bodySensitivity';
import { bodyMotionInformation } from './bodyMotionInformation';

const columns = (rows: number[][]) => rows[0].map((_, index) => Float64Array.from(rows, (row) => row[index]));

describe('information added in original unresolved directions', () => {
  it('rejects larger excitation along the same confounded explanation', () => {
    const original = bodySensitivity(
      columns([
        [10, 10],
        [10, 10],
      ]),
    ).directions;
    const score = bodyMotionInformation({
      original,
      candidate: columns([
        [100, 100],
        [100, 100],
      ]),
      selected: [0],
    });

    expect(score.resolved).toBe(false);
    expect(score.after).toBeLessThan(1e-6);
  });

  it('combines the original observations with a complementary experiment', () => {
    const original = bodySensitivity(
      columns([
        [10, 10],
        [10, 10],
      ]),
    ).directions;
    const candidate = columns([
      [10, -10],
      [10, -10],
    ]);
    const score = bodyMotionInformation({ original, candidate, selected: [0, 1] });
    const alone = bodyMotionInformation({
      original: bodySensitivity(
        columns([
          [0, 0],
          [0, 0],
        ]),
      ).directions,
      candidate,
      selected: [0, 1],
    });

    expect(score.resolved).toBe(true);
    expect(score.after).toBeCloseTo(Math.sqrt(200), 8);
    expect(alone.resolved).toBe(false);
  });

  it('profiles nuisance parameters rather than fixing them to their nominal values', () => {
    const original = bodySensitivity(
      columns([
        [0, 0],
        [0, 0],
      ]),
    ).directions;
    const score = bodyMotionInformation({
      original,
      candidate: columns([
        [20, 20],
        [20, 20],
      ]),
      selected: [0],
    });

    expect(score.resolved).toBe(false);
    expect(score.after).toBeLessThan(1e-6);
  });

  it('does not reward duplicate sampling or a dominant unrelated mode', () => {
    const original = bodySensitivity(
      columns([
        [1, 0],
        [0, 0],
      ]),
    ).directions;
    const candidate = columns([
      [5, 0],
      [0, 1000],
    ]);
    const input = { original, candidate, selected: [0] };

    const score = bodyMotionInformation(input);
    const repeated = bodyMotionInformation({
      ...input,
      candidate: candidate.map((column) => Float64Array.from([...column, ...column])),
    });

    expect(score.before).toBeCloseTo(repeated.before, 12);
    expect(score.after).toBeCloseTo(repeated.after, 12);
    expect(score.gain).toBeCloseTo(repeated.gain, 12);
    expect(score.resolved).toBe(repeated.resolved);
    expect(bodyMotionInformation(input).resolved).toBe(false);
  });

  it('refuses malformed selections and nonfinite columns', () => {
    const original = bodySensitivity(
      columns([
        [1, 0],
        [0, 1],
      ]),
    ).directions;

    expect(() => bodyMotionInformation({ original, candidate: columns([[NaN, 0]]), selected: [0] })).toThrow();
    expect(() => bodyMotionInformation({ original, candidate: columns([[1, 0]]), selected: [2] })).toThrow();
  });

  it('requires the minimum gain in every targeted direction even when the weakest direction changes', () => {
    const original = bodySensitivity(
      columns([
        [2.95 * Math.sqrt(2), 0],
        [0, 0],
      ]),
    ).directions;
    const candidate = columns([
      [Math.sqrt(2 * (3.02 ** 2 - 2.95 ** 2)), 0],
      [0, 3.01 * Math.sqrt(2)],
    ]);
    const score = bodyMotionInformation({ original, candidate, selected: [0, 1] });

    expect(score.before).toBe(0);
    expect(score.after).toBeCloseTo(3.01, 10);
    expect(score.gain).toBeCloseTo(0.07, 10);
    expect(score.resolved).toBe(false);
    expect(bodyMotionInformation({ original, candidate, selected: [1] }).resolved).toBe(true);
  });
});
