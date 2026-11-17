import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { RobotAnimation } from '../types/robotics';
import { sampleAnimation } from './animation';

const radians = Math.PI / 180;

function previousRotation(a?: number[], b?: number[], u = 0.25) {
  const quaternion = (angles?: number[]) =>
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler((angles?.[0] ?? 0) * radians, (angles?.[1] ?? 0) * radians, (angles?.[2] ?? 0) * radians),
    );
  const e = new THREE.Euler().setFromQuaternion(quaternion(a).slerp(quaternion(b), u));

  return [e.x / radians, e.y / radians, e.z / radians];
}

describe('animation root rotation', () => {
  it.each(['linear', 'smooth'] as const)(
    'omits translation-only rotation work for %s clips and reads edits',
    (mode) => {
      const animation: RobotAnimation = {
        id: 'root',
        name: 'Root',
        duration: 4,
        loop: false,
        interpolation: mode,
        keyframes: Array.from({ length: 4 }, (_, k) => ({
          t: k,
          values: { joint: k * 10 },
          root: { position: [k * 10, 0, 0] },
        })),
      };
      const expected = previousRotation();
      const rotations = vi.spyOn(THREE.Quaternion.prototype, 'setFromEuler');
      const conversions = vi.spyOn(THREE.Euler.prototype, 'setFromQuaternion');

      try {
        const first = sampleAnimation(animation, 1.25);
        const second = sampleAnimation(animation, 1.25);

        expect(first.root?.rotation).toEqual(expected);
        expect(second).toEqual(first);
        expect(first.root?.rotation).not.toBe(second.root?.rotation);
        expect(rotations).not.toHaveBeenCalled();
        expect(conversions).not.toHaveBeenCalled();

        for (const angles of [
          [0, 70, 0],
          [30, -45, 120],
          [0, 0, 0],
        ] as [number, number, number][]) {
          animation.keyframes[2].root!.rotation = angles;
          expect(sampleAnimation(animation, 1.25).root?.rotation).toEqual(previousRotation(undefined, angles));
          animation.keyframes[1].root!.rotation = angles;
          expect(sampleAnimation(animation, 1.25).root?.rotation).toEqual(previousRotation(angles, angles));
          delete animation.keyframes[1].root!.rotation;
        }

        delete animation.keyframes[2].root!.rotation;
        delete animation.keyframes[1].root;
        delete animation.keyframes[2].root;
        expect(sampleAnimation(animation, 1.25).root?.rotation).toEqual(expected);
        animation.loop = true;
        expect(sampleAnimation(animation, 3.5).root?.rotation).toEqual(previousRotation(undefined, undefined, 0.5));
        animation.keyframes[0].root!.rotation = [30, 15, -70];
        expect(sampleAnimation(animation, 3.5).root?.rotation).toEqual(
          previousRotation(undefined, animation.keyframes[0].root!.rotation, 0.5),
        );
        expect(first.root?.rotation).toEqual(expected);
      } finally {
        rotations.mockRestore();
        conversions.mockRestore();
      }
    },
  );
});
