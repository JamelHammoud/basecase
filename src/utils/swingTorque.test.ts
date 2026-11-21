import { describe, expect, it } from 'vitest';
import { cross, dot, G, norm, rotateAbout, type V3 } from './engineeringMath';
import { swingTorque } from './engineeringTorque';

function formerSwing(r: V3, axis: V3, grams: number, range: [number, number] = [-90, 90]) {
  const angles: number[] = [];
  let swing = 0;

  for (let t = Math.min(...range); t <= Math.max(...range) + 1e-6; t += 5) angles.push(t);

  for (const t of angles) {
    const rotated = rotateAbout(r, axis, t);
    const force: V3 = [0, (-grams / 1000) * G, 0];

    swing = Math.max(swing, Math.abs(dot(cross(rotated, force), axis)) / 1000);
  }

  return swing;
}

describe('swing torque sampling', () => {
  it('preserves sampled maxima across ranges, axes, masses and later edits', () => {
    const ranges: Array<[number, number] | undefined> = [
      undefined,
      [-90, 90],
      [90, -90],
      [12.3, 12.3],
      [-12.3, 12.6999995],
      [-360, 720],
      [NaN, 90],
      [0, NaN],
      [Infinity, NaN],
    ];
    const axes: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1], norm([1, 2, -3]), [0, 0, 0]];

    for (const range of ranges) {
      for (const axis of axes) {
        for (const grams of [0, -0, 150, -25, Infinity, NaN]) {
          const lever: V3 = [120, -30, 45];
          const before = structuredClone({ lever, axis, range });

          expect(swingTorque(lever, axis, grams, range)).toBe(formerSwing(lever, axis, grams, range));
          expect({ lever, axis, range }).toEqual(before);
          lever[2] = -70;
          expect(swingTorque(lever, axis, grams, range)).toBe(formerSwing(lever, axis, grams, range));
        }
      }
    }
  });
});
