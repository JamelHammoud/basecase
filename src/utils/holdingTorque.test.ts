import { describe, expect, it, vi } from 'vitest';
import * as math from './engineeringMath';
import { holdTorque, type JointAxis } from './holdingTorque';
import { seededRandom } from './seededRandom';

const formerTorque = (joint: JointAxis, point: math.V3, force: math.V3) =>
  joint.revolute
    ? -math.dot(math.cross(math.sub(point, joint.anchor), force), joint.axis)
    : -math.dot(force, joint.axis);

const hinge = (axis: math.V3): JointAxis => ({ anchor: [0, 0, 0], axis, revolute: true });

describe('holding torque', () => {
  it('opposes the moment about each axis and ignores force along the lever', () => {
    expect(holdTorque(hinge([1, 0, 0]), [0, 2, 0], [0, 0, -3])).toBe(6);
    expect(holdTorque(hinge([0, 1, 0]), [0, 0, 2], [-3, 0, 0])).toBe(6);
    expect(holdTorque(hinge([0, 0, 1]), [2, 0, 0], [0, -3, 0])).toBe(6);
    expect(holdTorque(hinge([0, 0, -1]), [2, 0, 0], [0, -3, 0])).toBe(-6);
    expect(holdTorque(hinge([0, 0, 1]), [2, 0, 0], [-3, 0, 0])).toBe(-0);
    expect(holdTorque(hinge([0, 0, 0]), [2, 0, 0], [0, -3, 0])).toBe(-0);
  });

  it('projects prismatic loads without reading the point or anchor', () => {
    const joint = { ...hinge([2, -3, 4]), anchor: [NaN, Infinity, -Infinity] as math.V3, revolute: false };

    expect(holdTorque(joint, [NaN, NaN, NaN], [5, 6, 7])).toBe(-20);
  });

  it('matches vector arithmetic exactly across mixed axes, forces and later edits', () => {
    const random = seededRandom('7ad2930f'.repeat(4));
    const vector = (): math.V3 => [random() * 2e6 - 1e6, random() * 2e6 - 1e6, random() * 2e6 - 1e6];

    for (let trial = 0; trial < 1200; trial++) {
      const joint = { anchor: vector(), axis: vector(), revolute: trial % 3 !== 0 };
      const point = vector();
      const force = vector();
      const before = structuredClone({ joint, point, force });

      expect(holdTorque(joint, point, force)).toBe(formerTorque(joint, point, force));
      expect({ joint, point, force }).toEqual(before);
      joint.anchor[trial % 3] += 17;
      joint.axis[(trial + 1) % 3] *= -2;
      point[(trial + 2) % 3] -= 13;
      force[trial % 3] *= 0.5;
      expect(holdTorque(joint, point, force)).toBe(formerTorque(joint, point, force));
    }
  });

  it('preserves signed zero, overflow and nonfinite propagation in every coordinate', () => {
    const values = [0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, 1e308, -1e308, Infinity, -Infinity, NaN];

    for (const revolute of [true, false]) {
      for (let coordinate = 0; coordinate < 12; coordinate++) {
        for (const value of values) {
          const vectors: math.V3[] = [
            [2, -3, 4],
            [5, -6, 7],
            [-8, 9, -10],
            [11, -12, 13],
          ];

          vectors[Math.floor(coordinate / 3)][coordinate % 3] = value;

          const [anchor, axis, point, force] = vectors;
          const joint = { anchor, axis, revolute };

          expect(holdTorque(joint, point, force)).toBe(formerTorque(joint, point, force));
        }
      }
    }
  });

  it.each([300, 600])('avoids temporary lever and moment vectors across %i loads', (count) => {
    const joint = hinge([1, 2, -3]);
    const point: math.V3 = [20, -40, 60];
    const force: math.V3 = [-5, 10, -15];
    const subtract = vi.spyOn(math, 'sub');
    const cross = vi.spyOn(math, 'cross');

    try {
      for (let i = 0; i < count; i++) formerTorque(joint, point, force);

      expect(subtract).toHaveBeenCalledTimes(count);
      expect(cross).toHaveBeenCalledTimes(count);
      subtract.mockClear();
      cross.mockClear();

      for (let i = 0; i < count; i++) holdTorque(joint, point, force);

      expect(subtract).not.toHaveBeenCalled();
      expect(cross).not.toHaveBeenCalled();
    } finally {
      subtract.mockRestore();
      cross.mockRestore();
    }
  });
});
