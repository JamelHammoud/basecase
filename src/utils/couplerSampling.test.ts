import { describe, expect, it } from 'vitest';
import { couplerPoint, couplerSampler, fourBarPose, placed, type PlacedFourBar } from './linkageKinematics';
import { seededRandom } from './seededRandom';

const reference = (l: PlacedFourBar, theta: number) => {
  const pose = fourBarPose(l, theta);

  return pose && placed(l, pose.p);
};

describe('coupler-only sampling', () => {
  it('matches full poses exactly across shapes, sweeps and nonfinite angles', () => {
    const random = seededRandom('123456789abcdef00123456789abcdef');

    for (let trial = 0; trial < 40; trial++) {
      const l: PlacedFourBar = {
        ground: 20 + random() * 80,
        crank: 20,
        coupler: 40,
        rocker: 40,
        point: [random() * 100, random() * -50],
        origin: [random() * 100, random() * -100],
        angle: random() * 720 - 360,
      };
      const saved = structuredClone(l);
      const sample = couplerSampler(l);
      const angles = [...Array.from({ length: 49 }, (_, i) => 360 - i * 15), NaN, Infinity, -Infinity];

      for (const theta of angles) {
        expect(sample(theta)).toEqual(reference(l, theta));
        expect(couplerPoint(l, theta)).toEqual(reference(l, theta));
      }

      expect(l).toEqual(saved);
    }
  });

  it('returns independent points and reads edited geometry on subsequent calls', () => {
    const l: PlacedFourBar = {
      ground: 40,
      crank: 20,
      coupler: 50,
      rocker: 50,
      point: [100, -12],
      origin: [31, -19],
      angle: 37,
    };
    const sample = couplerSampler(l);
    const first = sample(45)!;
    const saved = [...first];

    l.point = [80, 16];
    l.coupler = 45;

    expect(sample(45)).toEqual(reference(l, 45));
    expect(couplerPoint(l, 45)).toEqual(reference(l, 45));
    expect(first).toEqual(saved);
    expect(sample(45)).not.toBe(sample(45));

    l.angle = -23;
    l.origin = [-9, 60];

    expect(couplerSampler(l)(45)).toEqual(reference(l, 45));
    expect(couplerPoint(l, 45)).toEqual(reference(l, 45));
  });
});
