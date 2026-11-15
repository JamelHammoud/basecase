import { Matrix4, MathUtils, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import { jointMotion } from './kinematicsMotion';

const joint = (over: Partial<RobotJoint> = {}): RobotJoint => ({
  id: 'hinge',
  name: 'Hinge',
  type: 'revolute',
  parent: [],
  child: [],
  origin: [27, -43, 19],
  axis: [2, -3, 4],
  ...over,
});

function previousMotion(j: RobotJoint, value: number): Matrix4 {
  if (!['revolute', 'prismatic'].includes(j.type) || !value) return new Matrix4();

  const axis = new Vector3(...j.axis).normalize();

  if (j.type === 'prismatic') return new Matrix4().makeTranslation(axis.x * value, axis.y * value, axis.z * value);

  const origin = new Vector3(...j.origin);
  const turn = new Quaternion().setFromAxisAngle(axis, MathUtils.degToRad(value));
  const rotated = origin.clone().applyQuaternion(turn);

  return new Matrix4().makeRotationFromQuaternion(turn).setPosition(origin.sub(rotated));
}

describe('joint motion workspace', () => {
  it('matches allocating transforms across mixed calls and later edits', () => {
    const hinge = joint();
    const slide = joint({ type: 'prismatic', axis: [-4, 0, 2] });
    const fixed = joint({ type: 'fixed' });
    const out = new Matrix4();
    const retained = jointMotion(hinge, 37);
    const snapshot = retained.toArray();

    for (let i = 0; i < 300; i++) {
      hinge.origin = [i - 150, i * -0.7, 9 - i * 0.2];
      hinge.axis = [Math.sin(i), Math.cos(i), i % 7];

      for (const j of [hinge, slide, fixed]) {
        const before = structuredClone(j);

        for (const value of [i - 150, 0, -0, 360, -720, NaN, Infinity]) {
          expect(jointMotion(j, value, out)).toBe(out);
          expect(out.elements).toEqual(previousMotion(j, value).elements);
        }

        expect(j).toEqual(before);
      }
    }

    expect(retained.toArray()).toEqual(snapshot);
  });

  it('keeps an offset hinge pivot fixed and rotates points around its normalized axis', () => {
    const hinge = joint();
    const pivot = new Vector3(...hinge.origin);
    const axis = new Vector3(...hinge.axis).normalize();
    const point = new Vector3(31, 57, -23);

    for (const angle of [-180, -75, 0, 37, 90, 360]) {
      const motion = jointMotion(hinge, angle);
      const expected = point.clone().sub(pivot).applyAxisAngle(axis, MathUtils.degToRad(angle)).add(pivot);

      expect(pivot.clone().applyMatrix4(motion).distanceTo(pivot)).toBeLessThan(1e-12);
      expect(point.clone().applyMatrix4(motion).distanceTo(expected)).toBeLessThan(1e-12);
    }
  });

  it('preserves zero-axis and nonfinite-input behavior without retaining workspace state', () => {
    const out = new Matrix4();

    for (const axis of [
      [0, 0, 0],
      [NaN, 1, 0],
      [Infinity, 0, 1],
      [-0, 1, -0],
    ]) {
      for (const origin of [
        [0, 0, 0],
        [NaN, 2, 3],
        [1, Infinity, 3],
        [-0, -0, -0],
      ]) {
        const j = joint({ axis: axis as RobotJoint['axis'], origin: origin as RobotJoint['origin'] });

        expect(jointMotion(j, 23, out).elements).toEqual(previousMotion(j, 23).elements);
        expect(jointMotion(joint(), -47, out).elements).toEqual(previousMotion(joint(), -47).elements);
      }
    }
  });

  it.each([300, 600])('avoids pivot clones across %i hinge evaluations', (size) => {
    const hinge = joint();
    const out = new Matrix4();
    const clones = vi.spyOn(Vector3.prototype, 'clone');

    try {
      for (let i = 0; i < size; i++) jointMotion(hinge, i + 1, out);

      expect(clones.mock.calls).toHaveLength(0);
    } finally {
      clones.mockRestore();
    }
  });
});
