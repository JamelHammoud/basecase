import { describe, expect, it } from 'vitest';
import type { RobotSkeleton, SkeletonJoint } from '../types/skeleton';
import { skeletonText } from '../agent/skeleton';
import { dragJoint } from '../agent/skeletonDrag';
import { skeletonSizing } from './skeletonSizing';

function fixture(size: number, branched: boolean, leg = false) {
  let reads = 0;
  const joints = Array.from({ length: size }, (_, i): SkeletonJoint => ({
    id: `joint-${i}`,
    parent: i ? `joint-${branched ? 0 : i - 1}` : undefined,
    origin: [i * 10, 0, 0],
    axis: leg ? [1, 0, 0] : [0, 0, 1],
    limb: leg ? 'leg' : 'arm',
    linkMassG: 10,
    tip: [i * 10 + 10, 0, 0],
  }));
  const skeleton: RobotSkeleton = {
    frame: 'z-up',
    pairs: [],
    massG: size * 10,
    joints: new Proxy(joints, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, receiver);
      },
    }),
  };

  return { skeleton, reads: () => reads };
}

describe('skeleton hierarchy lookups', () => {
  it.each([
    { size: 100, leg: false },
    { size: 200, leg: false },
    { size: 200, leg: true },
  ])('sizes a $size-joint chain with leg=$leg without repeated list searches', ({ size, leg }) => {
    const { skeleton, reads } = fixture(size, false, leg);
    const result = skeletonSizing(skeleton);

    if (typeof result === 'string') throw new Error(result);

    expect(result.joints).toHaveLength(size);
    expect(result.joints[0].riders).toEqual(skeleton.joints.slice(1).map((joint) => joint.id));
    expect(result.joints[0].massG).toBe(size * 10);
    expect(result.joints[0].riderRadiusMm?.[`joint-${size - 1}`]).toBe((size - 1) * 10);
    expect(result.joints[size - 1].riders).toEqual([]);
    expect(result.joints[size - 1].inertiaKgM2).toBeCloseTo(0.01 * 0.01 ** 2, 12);
    expect(reads()).toBeLessThan(size * 15);
  });

  it.each([false, true])('drags every descendant with branched=%s in linear list reads', (branched) => {
    const size = 200;
    const { skeleton, reads } = fixture(size, branched);
    const result = dragJoint(skeleton, [], { id: 'joint-0', delta: [0, 5, 0] });

    expect(result.moved.size).toBe(size);
    expect(result.skeleton.joints.map((joint) => joint.origin)).toEqual(
      Array.from({ length: size }, (_, i) => [i * 10, 5, 0]),
    );
    expect(skeleton.joints.every((joint) => joint.origin[1] === 0)).toBe(true);
    expect(reads()).toBeLessThan(size * 8);
  });

  it('describes ordered link endpoints without searching the whole list per joint', () => {
    const size = 200;
    const { skeleton, reads } = fixture(size, false);
    const text = skeletonText({ skeleton, moved: new Map(), turned: [], problems: [] });

    expect(text).toContain('link 10 mm to joint-1');
    expect(text).toContain(
      `- joint-${size - 1} (arm): at [${(size - 1) * 10}, 0, 0] axis [0, 0, 1], link 10 mm to its tip`,
    );
    expect(reads()).toBeLessThan(size * 5);
  });
});
