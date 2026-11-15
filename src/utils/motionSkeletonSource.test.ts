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
