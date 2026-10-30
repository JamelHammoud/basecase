import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import { sizeActuators } from '../utils/actuatorSizing';
import { skeletonSizing } from '../utils/skeletonSizing';
import { declareJoints } from '../workspace/agentBuildRequests';
import { toCad, toScene, type V3 } from './agentFrame';
import { mirrorParts, specToPart } from './agentScene';
import { buildSkeleton, skeletonText, type SkeletonJointInput } from './skeleton';
import { framedFollowOps, resolveFrames } from './skeletonFrames';
import { alignToSkeleton } from './skeletonMirror';

const SERVO = 'component:feetech-sts3215|c018';

function leg(side: 'left' | 'right', x: number): SkeletonJointInput[] {
  const pitch: V3 = [1, 0, 0];

  return [
    { id: `${side}-hip`, origin: [x, 0, 300], axis: pitch, limb: 'leg', actuator: SERVO, range: [-90, 90] },
    { id: `${side}-knee`, parent: `${side}-hip`, origin: [x, 0, 170], axis: pitch, limb: 'leg', actuator: SERVO },
    {
      id: `${side}-ankle`,
      parent: `${side}-knee`,
      origin: [x, 0, 40],
      axis: pitch,
      limb: 'leg',
      actuator: SERVO,
      tip: [x, 0, 0],
    },
  ];
}

const shoulder: SkeletonJointInput = {
  id: 'left-shoulder',
  origin: [80, 0, 450],
  axis: [1, 0, 0],
  limb: 'arm',
  actuator: SERVO,
  tip: [80, 0, 300],
};

const biped = (rightX = -50) =>
  buildSkeleton({ joints: [...leg('left', 50), ...leg('right', rightX), shoulder], mass_g: 2500 });

const project = (skeleton: RobotSkeleton): ProjectSettings => ({
  printer: 'default',
  material: 'PLA',
  infillPct: 20,
  skeleton,
});

describe('define_skeleton', () => {
  it('pairs left and right joints and measures each link', () => {
    const build = biped();

    expect(build.problems).toEqual([]);
    expect(build.skeleton.pairs).toContainEqual(['left-knee', 'right-knee']);
    expect(skeletonText(build)).toContain(
      '- left-knee (leg): at [50, 0, 170] axis [1, 0, 0], link 130 mm to left-ankle',
    );
  });

  it('flags a pair that is not a mirror image', () => {
    expect(biped(-53).problems).toContain('pair left-hip / right-hip: not mirror images, 3 mm apart');
  });

  it('moves parts placed in a joint frame when the joint moves', () => {
    const first = biped();
    const placed = resolveFrames(
      [
        {
          op: 'add',
          part: { id: 'shin', shape: 'box', size: [30, 30, 100], position: [0, 0, -65], frame: 'left-knee' },
        },
      ],
      project(first.skeleton),
    );
    const shin = specToPart(placed.ops[0].op === 'add' ? placed.ops[0].part : { id: 'x' });

    expect(toCad(shin.position)).toEqual([50, 0, 105]);

    const longer = buildSkeleton({ joints: [{ ...leg('left', 50)[1], origin: [50, 0, 160] }] }, first.skeleton);
    const follow = framedFollowOps([shin], longer.moved);

    expect(follow).toEqual([{ op: 'update', part: { id: 'shin', position: [50, 0, 95] } }]);
  });

  it('mirrors a framed part onto its paired joint', () => {
    const { skeleton } = biped(-56);
    const bracket = specToPart({
      id: 'left-knee-bracket',
      shape: 'box',
      size: [20, 20, 20],
      position: [62, 0, 170],
      frame: 'left-knee',
    });
    const copies = mirrorParts([bracket], ['left-knee-bracket'], 'x', {});
    const { copies: placed, notes } = alignToSkeleton(copies, skeleton, 'x');

    expect(placed[0].id).toBe('right-knee-bracket');
    expect(placed[0].frame).toBe('right-knee');
    expect(toCad(placed[0].position)).toEqual([-68, 0, 170]);
    expect(notes).toEqual(['right-knee-bracket placed on the right-knee joint, 6 mm from the plain mirror.']);
  });

  it('seeds define_joints from the skeleton joint with the same id', () => {
    const { skeleton } = biped();
    const parts = ['thigh', 'shin'].map((id) => specToPart({ id, shape: 'box', size: [20, 20, 20] }));
    const { next, text } = declareJoints(
      { joints: [{ id: 'left-knee', parent: ['thigh'], child: ['shin'] }] },
      parts,
      project(skeleton),
      () => null,
    );
    const knee = next.joints!.find((j) => j.id === 'left-knee')!;

    expect(knee.origin).toEqual(toScene([50, 0, 170]));
    expect(knee.limb).toBe('leg');
    expect(text).toContain('(from the skeleton)');
  });
});

describe('size_actuators on a skeleton', () => {
  it('sizes every joint from link lengths and the estimated mass before any part exists', () => {
    const input = skeletonSizing(biped().skeleton);

    if (typeof input === 'string') throw new Error(input);

    const knee = input.joints.find((j) => j.id === 'left-knee')!;
    const arm = input.joints.find((j) => j.id === 'left-shoulder')!;

    expect(knee.stanceNm).toBeGreaterThan(knee.holdNm);
    expect(knee.riders).toEqual(['left-ankle']);
    expect(arm.stanceNm).toBeUndefined();
    expect(arm.holdNm).toBeGreaterThan(0.1);

    const best = sizeActuators(input)[0];

    expect(best.failures).toEqual([]);
    expect(best.picks).toHaveLength(7);
  });

  it('asks for a mass when the skeleton has none', () => {
    const { skeleton } = buildSkeleton({ joints: leg('left', 50) });

    expect(skeletonSizing(skeleton)).toMatch(/mass_g/);
  });
});
