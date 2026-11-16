import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { parseBvh } from './mocap';
import type { Mocap, MocapRotation } from './mocapBones';
import { sharedTorsoBvh, wrappedHingeBvh } from './motionSkeleton.fixtures';
import { motionWithEndSites } from './motionSkeletonEnds';
import { motionChains } from './motionSkeletonSource';
import { sampleMotionFrames, type MotionFrames } from './motionSkeletonValidation';

function sample(motion: Mocap): MotionFrames {
  const result = sampleMotionFrames(motion);

  if ('problem' in result) throw new Error(result.problem);

  return result;
}

function branches(count: number) {
  const tips = Array.from({ length: count }, (_, index) => `Arm${index}`);
  const bones = ['Root', ...tips];
  const positions = new Map(bones.map((bone, index) => [bone, new Vector3(index, 0, 0)]));
  const rotations = [90, -90, 90, -90].map(
    (degrees) =>
      new Map<string, MocapRotation[]>([
        [
          'Root',
          [
            { axis: 'Z', degrees },
            { axis: 'X', degrees: 90 },
          ],
        ],
        ...tips.map((tip) => [tip, [{ axis: 'Y', degrees: degrees / 9 }]] as [string, MocapRotation[]]),
      ]),
  );
  const motion: Mocap = {
    name: 'Branches',
    frameTime: 0.1,
    frames: 4,
    duration: 0.3,
    bones,
    root: 'Root',
    parentOf: new Map(bones.map((bone) => [bone, bone === 'Root' ? null : 'Root'])),
    rest: positions,
    sample: () => positions,
    rootQuaternion: () => {
      throw new Error('Frames have already been sampled');
    },
  };

  return { motion, samples: { positions: rotations.map(() => positions), rotations } };
}

describe('motion source channels', () => {
  it.each([1, 16, 64])('keeps root-first axes through %i ancestor links', (count) => {
    const { motion, samples } = branches(count);

    for (let i = 1; i < count; i++) motion.parentOf.set(`Arm${i}`, `Arm${i - 1}`);

    const before = structuredClone(motion.parentOf);
    const chains = motionChains(motion, samples, { scale: 1 });

    expect(chains).toHaveLength(1);
    expect(chains[0].axes.map((axis) => axis.joint.id)).toEqual([
      `motion_${count}_0_z`,
      ...Array.from({ length: count }, (_, i) => `motion_${count}_${i + 1}_y`),
    ]);
    expect(motion.parentOf).toEqual(before);
    expect(motionChains(motion, samples, { scale: 1 })).toEqual(chains);
  });

  it.each([100, 200])('assigns axis identities across %i endpoints with linear bone-list reads', (count) => {
    const { motion, samples } = branches(count);
    let reads = 0;

    motion.bones = new Proxy(motion.bones, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, receiver);
      },
    });

    const chains = motionChains(motion, samples, { scale: 1 });

    expect(chains.map((chain) => chain.axes.map((axis) => axis.joint.id))).toEqual(
      Array.from({ length: count }, (_, i) => [`motion_${i + 1}_0_z`, `motion_${i + 1}_${i + 1}_y`]),
    );
    expect(reads).toBeLessThan((count + 1) * 4);
  });

  it('keeps first duplicate indices, absent ancestors and refreshed bone ordering', () => {
    const { motion, samples } = branches(2);

    motion.bones = ['Arm1', 'Arm0', 'Arm1'];

    const first = motionChains(motion, samples, { scale: 1 });

    expect(first.map((chain) => chain.axes.map((axis) => axis.joint.id))).toEqual([
      ['motion_0_-1_z', 'motion_0_0_y'],
      ['motion_1_-1_z', 'motion_1_1_y'],
      ['motion_0_-1_z', 'motion_0_0_y'],
    ]);
    motion.bones = ['Root', 'Arm0', 'Arm1'];

    const second = motionChains(motion, samples, { scale: 1 });

    expect(second.map((chain) => chain.axes.map((axis) => axis.joint.id))).toEqual([
      ['motion_1_0_z', 'motion_1_1_y'],
      ['motion_2_0_z', 'motion_2_2_y'],
    ]);
    expect(first[0].axes[0].joint.id).toBe('motion_0_-1_z');
  });

  it.each([12, 24])('prepares shared channels once across %i endpoints', (count) => {
    const { motion, samples } = branches(count);
    const before = structuredClone(samples);
    const reads = samples.rotations.map((frame) => vi.spyOn(frame, 'get'));
    const chains = motionChains(motion, samples, { scale: 2 });

    expect(chains).toHaveLength(count);
    expect(reads.reduce((sum, spy) => sum + spy.mock.calls.filter(([bone]) => bone === 'Root').length, 0)).toBe(9);

    for (const [index, chain] of chains.entries()) {
      expect(chain.axes.map(({ joint, values }) => ({ joint, values }))).toEqual([
        {
          joint: {
            id: `motion_${index + 1}_0_z`,
            name: 'Root z',
            origin: [0, 0, 0],
            axis: [0, -1, 0],
            type: 'revolute',
            limb: 'arm',
          },
          values: [0, -180, 0, -180],
        },
        {
          joint: {
            id: `motion_${index + 1}_${index + 1}_y`,
            name: `Arm${index} y`,
            origin: [(index + 1) * 2, 0, 0],
            axis: [0, -1, 0],
            type: 'revolute',
            limb: 'arm',
          },
          values: [0, -20, 0, -20],
        },
      ]);
      expect(chain.tip).toEqual([(index + 1) * 2, 0, 0]);
      expect(chain.targets).toEqual(Array.from({ length: 4 }, () => chain.tip));
    }

    reads.forEach((spy) => spy.mockRestore());
    expect(samples).toEqual(before);
  });

  it('keeps shared torso channels and each endpoint identity when selecting limbs', () => {
    const motion = motionWithEndSites(parseBvh(sharedTorsoBvh()));
    const samples = sample(motion);
    const all = motionChains(motion, samples, { scale: 1 });
    const selected = motionChains(motion, samples, { scale: 1, limbs: ['LeftHand'] });

    expect(selected).toEqual(all.filter((chain) => chain.name === 'LeftHand'));
    expect(all[0].axes[0].values).toBe(all[1].axes[0].values);
    expect(all[0].axes[0].joint).not.toBe(all[1].axes[0].joint);
    expect(all[0].axes[0].joint.id).not.toBe(all[1].axes[0].joint.id);
  });

  it('unwraps the seam and refreshes channels for every call', () => {
    const motion = motionWithEndSites(parseBvh(wrappedHingeBvh()));
    const samples = sample(motion);
    const first = motionChains(motion, samples, { scale: 1 });

    expect(first[0].axes[0].values).toEqual([0, 5, 10, 15, 20]);
    samples.rotations[1].get('Base')![0].degrees = 160;

    const second = motionChains(motion, samples, { scale: 1 });

    expect(second[0].axes[0].values).toEqual([0, -10, 10, 15, 20]);
    expect(first[0].axes[0].values).toEqual([0, 5, 10, 15, 20]);
  });
});
