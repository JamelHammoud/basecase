import { expect, it } from 'vitest';
import { bodySensitivity } from './bodySensitivity';
import { bodyMotionInformation, bodyInformationContributions } from './bodyMotionInformation';

const directions = (rows: number[][]) =>
  bodySensitivity(rows[0].map((_, index) => Float64Array.from(rows, (row) => row[index]))).directions;

it('accumulates complementary observations while retaining an inseparable nuisance direction', () => {
  const original = directions([[0, 0, 0]]);
  const first = [Float64Array.of(10), Float64Array.of(0), Float64Array.of(0)];
  const second = [Float64Array.of(0), Float64Array.of(10), Float64Array.of(10)];
  const accepted = bodyMotionInformation({ original, candidate: first, selected: [0, 1, 2] });
  const combined = bodyInformationContributions({
    original: accepted.directions,
    candidate: second,
    selected: [0, 1, 2],
  });

  expect(combined.score.resolved).toBe(false);
  expect(combined.contribution).toBeGreaterThan(0);
  expect(combined.score.directions.filter((direction) => !direction.distinguishable)).toHaveLength(1);
  expect(
    bodyInformationContributions({ original: accepted.directions, candidate: first, selected: [0] }).contribution,
  ).toBe(0);
  expect(
    bodyInformationContributions({ original: combined.score.directions, candidate: second, selected: [1, 2] })
      .contribution,
  ).toBeLessThan(1e-6);
});

it('does not spend another round on greater excitation of the same structurally coupled direction', () => {
  const original = directions([[10, 10]]);
  const candidate = [Float64Array.of(100), Float64Array.of(100)];
  const information = bodyInformationContributions({ original, candidate, selected: [0, 1] });

  expect(information.score.resolved).toBe(false);
  expect(information.contribution).toBeLessThan(1e-10);
});
