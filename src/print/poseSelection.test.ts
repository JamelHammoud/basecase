import { describe, expect, it } from 'vitest';
import { customModel } from '../data/printers';
import { sameDirection, type PrintPose, type PrintShape } from '../three/printability';
import type { PartPrint } from '../types/robotics';
import { bedOf, fitOnBed, heightFits, placementFits, type Bed } from './bed';
import { choosePose, poseScore } from './plan';
import { planInput } from './plan.fixtures';

function previousFit(pose: PrintPose, bed: Bed, print?: PartPrint) {
  if (!print?.at || !print.plate) return fitOnBed(...pose.size, bed);

  const [w, d] = print.turned ? [pose.size[1], pose.size[0]] : pose.size;
  const rect = { x: print.at[0], y: print.at[1], w, d };

  return heightFits(pose.size[2], bed) && placementFits(rect, bed) ? { yaw: print.turned ? 90 : 0 } : null;
}

function previousChoice(shape: PrintShape, bed: Bed, print?: PartPrint) {
  const forced = print?.down && shape.poses.find((p) => sameDirection(p.down, print.down!));
  const candidates = forced ? [forced] : shape.poses.filter((p) => !p.requested);
  const scored = candidates.map((pose) => {
    const fit = previousFit(pose, bed, print);

    return { pose, fit, score: poseScore(pose, !!fit) };
  });
  const { pose, fit } = scored.reduce((a, b) => (b.score < a.score ? b : a));

  return { pose, size: pose.size, fits: !!fit, yaw: fit?.yaw };
}

function fixture(seed: number): PrintShape {
  const poses = Array.from({ length: 12 }, (_, i): PrintPose => ({
    ...planInput('part', [10 + ((seed * 7 + i * 31) % 140), 10 + ((seed + i * 17) % 120), 5 + i * 9]).check.pose,
    down: [Math.cos(i), -1, Math.sin(i)],
    supportMm3: ((seed + i * 3) % 7) * 100,
    contactMm2: ((seed * 3 + i) % 5) * 50,
    requested: i % 4 === 0,
  }));

  return { poses, minWallMm: 2, thinShare: 0.1, thinAreaMm2: 30 };
}

describe('print pose selection', () => {
  it('matches exhaustive scoring across bed fits, manual faces and fixed placements', () => {
    const beds = [
      bedOf(customModel({ width: 100, depth: 80, height: 90 })),
      bedOf(customModel({ width: 30, depth: 30, height: 20 })),
    ];

    for (let seed = 0; seed < 40; seed++) {
      const shape = fixture(seed);
      const saved = structuredClone(shape);
      const choices: (PartPrint | undefined)[] = [
        undefined,
        { down: shape.poses[0].down },
        { down: shape.poses[7].down },
        { down: [0, 0, 1] },
        { at: [10, 10], plate: 1 },
        { at: [10, 10], plate: 1, turned: true },
      ];

      for (const bed of beds)
        for (const print of choices) {
          const expected = previousChoice(shape, bed, print);
          const actual = choosePose(shape, bed, print);

          expect(actual).toMatchObject(expected);
          expect(actual.pose).toBe(expected.pose);
          expect(actual).toMatchObject({ minWallMm: 2, thinShare: 0.1, thinAreaMm2: 30 });
        }

      expect(shape).toEqual(saved);
    }
  });

  it('preserves first ties and nonfinite score comparisons', () => {
    const bed = bedOf(customModel({ width: 100, depth: 100, height: 100 }));
    const base = planInput('part', [10, 20, 30]).check.pose;

    for (const scores of [
      [5, 5, 5],
      [NaN, 0, -Infinity],
      [Infinity, 1, 0],
      [5, NaN, 0],
      [Infinity, Infinity, Infinity],
    ]) {
      const shape: PrintShape = {
        poses: scores.map((supportMm3) => ({ ...base, supportMm3 })),
        minWallMm: 2,
        thinShare: 0,
        thinAreaMm2: 0,
      };

      expect(choosePose(shape, bed).pose).toBe(previousChoice(shape, bed).pose);
    }
  });
});
