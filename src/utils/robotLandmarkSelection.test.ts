import { describe, expect, it, vi } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import { buildRig, type Rig, type V3 } from './kinematics';
import { autoMapRobot } from './mocapBones';
import { deepestBelow, robotLandmarks, soleRefs } from './retargetRobot';

const joint = (id: string, options: Partial<RobotJoint> = {}): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: ['base'],
  child: [`${id}-part`],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  ...options,
});

function branchingRig(count: number): Rig {
  const joints = Array.from({ length: count }, (_, i) =>
    joint(`joint-${i}`, {
      name: 'LeftElbow neck chest',
      parentJoint: i ? `joint-${Math.floor((i - 1) / 2)}` : undefined,
    }),
  );
  const rig = buildRig(joints, []);

  rig.joints.reverse();

  return rig;
}

describe('robot landmark selection', () => {
  it('maps the shallowest movable joints with name priority, id fallbacks and source-order ties', () => {
    const joints = [
      joint('fixed', { name: 'LeftShoulder neck torso', type: 'fixed' }),
      joint('deep', { name: 'LeftShoulder neck torso', parentJoint: 'later' }),
      joint('first', { name: 'LeftShoulder neck torso', type: 'prismatic' }),
      joint('later', { name: 'LeftShoulder neck torso' }),
      joint('right_knee', { name: 'unnamed' }),
      joint('left_wrist', { name: 'RightElbow' }),
      joint('neck_by_id', { name: 'unnamed' }),
    ];
    const rig = buildRig(joints, []);
    const before = structuredClone(joints);

    Object.freeze(rig.joints);

    expect(autoMapRobot(rig)).toEqual({
      leftShoulder: 'first',
      rightKnee: 'right_knee',
      rightElbow: 'left_wrist',
      neck: 'first',
      chest: 'first',
    });
    expect(Object.keys(autoMapRobot(rig))).toEqual(['leftShoulder', 'rightKnee', 'rightElbow', 'neck', 'chest']);
    expect(joints).toEqual(before);
    expect(autoMapRobot(buildRig([], []))).toEqual({ neck: undefined, chest: undefined });
    expect(autoMapRobot(buildRig([joint('head', { type: 'fixed' })], []))).toEqual({
      neck: undefined,
      chest: undefined,
    });
  });

  it('selects deepest movable descendants including the base and preserves the first equal-depth joint', () => {
    const rig = buildRig(
      [
        joint('base'),
        joint('first', { parentJoint: 'base', type: 'prismatic' }),
        joint('second', { parentJoint: 'base' }),
        joint('fixed', { parentJoint: 'first', type: 'fixed' }),
        joint('unrelated'),
        joint('unrelated-end', { parentJoint: 'unrelated' }),
      ],
      [],
    );
    const before = structuredClone(rig.joints);

    expect(deepestBelow(rig, 'base')).toBe(rig.byId.get('first'));
    expect(deepestBelow(rig, 'second')).toBe(rig.byId.get('second'));
    expect(deepestBelow(rig, 'fixed')).toBeUndefined();
    expect(deepestBelow(rig, 'missing')).toBeUndefined();
    expect(deepestBelow(rig, undefined)).toBeUndefined();
    expect(rig.joints).toEqual(before);

    rig.joints.reverse();

    expect(deepestBelow(rig, 'base')).toBe(rig.byId.get('second'));
  });

  it('rebuilds choices after names, depths and ancestry change, using zero for missing depths', () => {
    const first = joint('first', { name: 'LeftHip neck torso' });
    const second = joint('second', { name: 'LeftHip neck torso', parentJoint: 'first' });
    const rig = buildRig([first, second], []);
    const previous = autoMapRobot(rig);

    rig.depth.delete('second');
    rig.depth.set('first', 3);

    expect(autoMapRobot(rig)).toMatchObject({ leftHip: 'second', neck: 'second', chest: 'second' });
    expect(deepestBelow(rig, 'first')).toBe(first);

    first.name = 'RightHip';
    rig.chain.set('first', new Set(['second']));

    expect(autoMapRobot(rig)).toMatchObject({ leftHip: 'second', rightHip: 'first' });
    expect(deepestBelow(rig, 'second')).toBe(first);
    expect(previous).toEqual({ leftHip: 'first', neck: 'first', chest: 'first' });
  });

  it('uses the deepest named ends for head and torso carriers and the same limb end for soles', () => {
    const joints = [
      joint('torso'),
      joint('head-first', { parentJoint: 'torso', origin: [1, 2, 3] }),
      joint('head-second', { parentJoint: 'torso', origin: [4, 5, 6] }),
      joint('spine', { parentJoint: 'torso', origin: [7, 8, 9] }),
      joint('ankle', { parentJoint: 'torso' }),
      joint('toe', { parentJoint: 'ankle', origin: [10, 11, 12] }),
      joint('fixed-head', { parentJoint: 'head-first', type: 'fixed' }),
    ];
    const rig = buildRig(joints, []);
    const source = {
      rig,
      pointOf: (id: string): V3 => [...rig.byId.get(id)!.origin],
      joints: { leftShoulder: 'ankle', rightShoulder: 'ankle', leftAnkle: 'ankle' },
    };
    const result = robotLandmarks(source);

    expect(result.rp.get('head')!.toArray()).toEqual([1, 2, 3]);
    expect(result.carriers.get('head')!.partId).toBe('head-first-part');
    expect(result.carriers.get('neck')).toBeUndefined();
    expect(result.carriers.get('chest')!.partId).toBe('spine-part');
    expect(result.carriers.get('leftToe')!.partId).toBe('toe-part');
    expect(soleRefs(source)).toEqual([{ part: 'toe-part', p: [10, 11, 12] }]);

    rig.depth.set('head-second', 9);
    rig.depth.delete('spine');

    const edited = robotLandmarks(source);

    expect(edited.rp.get('head')!.toArray()).toEqual([4, 5, 6]);
    expect(edited.carriers.get('head')!.partId).toBe('head-second-part');
    expect(edited.carriers.get('chest')!.partId).toBe('torso-part');
    expect(result.rp.get('head')!.toArray()).toEqual([1, 2, 3]);
  });
});

describe('robot landmark selection work', () => {
  it.each([300, 600])('reads each of %i joint depths once while mapping all robot landmarks', (count) => {
    const rig = branchingRig(count);
    const depths = vi.spyOn(rig.depth, 'get');
    const result = autoMapRobot(rig);

    expect(depths).toHaveBeenCalledTimes(count);
    expect(result).toEqual({ leftElbow: 'joint-0', neck: 'joint-0', chest: 'joint-0' });
    depths.mockRestore();
  });

  it.each([300, 600])('reads each of %i descendant depths once when finding a limb end', (count) => {
    const rig = branchingRig(count);
    const expected = rig.joints[0];
    const depths = vi.spyOn(rig.depth, 'get');

    expect(deepestBelow(rig, 'joint-0')).toBe(expected);
    expect(depths).toHaveBeenCalledTimes(count);
    depths.mockRestore();
  });

  it.each([300, 600])('reads each of %i named depths once per head or torso selection', (count) => {
    const rig = branchingRig(count);
    const depths = vi.spyOn(rig.depth, 'get');
    const result = robotLandmarks({
      rig,
      pointOf: () => [1, 2, 3],
      joints: { neck: 'joint-0', leftShoulder: 'joint-0', rightShoulder: 'joint-0' },
    });
    const part = `${rig.joints[0].id}-part`;

    expect(depths).toHaveBeenCalledTimes(count * 4);
    expect(result.carriers.get('head')!.partId).toBe(part);
    expect(result.carriers.get('neck')!.partId).toBe(part);
    expect(result.carriers.get('chest')!.partId).toBe(part);
    depths.mockRestore();
  });
});
