import { describe, expect, it } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT, type RobotJoint } from '../types/robotics';
import { buildRig, poseDeltas, resolveJoints } from '../utils/kinematics';
import { declareJoints } from '../workspace/agentBuildRequests';
import { HINGE_RANGE, handJoint, jointFrom, withJoints, withoutJoint, withRange } from './declare';

const base = { ...box('base', [0, 10, 0], [60, 20, 60], 100), rotation: [0, 0.5, 0] as [number, number, number] };
const arm = box('arm', [0, 50, 0], [10, 60, 10], 20);
const parts = [base, arm];

describe('one way to declare a joint', () => {
  it('gives the agent’s define_joints the same joint as the shared module', () => {
    const { next, text } = declareJoints(
      { joints: [{ id: 'shoulder', parent: ['base'], child: ['arm'], origin: [0, 0, 20], axis: [1, 0, 0] }] },
      parts,
      DEFAULT_PROJECT,
      () => null,
    );
    const direct = jointFrom(
      {
        id: 'shoulder',
        name: 'shoulder',
        type: 'revolute',
        parent: ['base'],
        child: ['arm'],
        origin: [0, 20, -0],
        axis: [1, 0, -0],
      },
      parts,
    );

    expect(text).toMatch(/^1 joint declared\./);
    expect(next.joints).toEqual([direct]);
    expect(direct.frame?.part).toBe('base');
    expect(resolveJoints([direct], parts)[0].origin.map((v) => Math.round(v * 1e3) / 1e3)).toEqual([0, 20, 0]);
  });

  it('records the first range and replaces a joint with the same id', () => {
    const first = withJoints(DEFAULT_PROJECT, [{ ...jointOf('hinge_1'), range: [-30, 30] }]);
    const second = withJoints(first, [{ ...jointOf('hinge_1'), range: [-60, 60] }]);

    expect(second.joints).toHaveLength(1);
    expect(second.firstRanges).toEqual({ hinge_1: [-30, 30] });
  });

  it('makes a hand-made hinge that turns only its child', () => {
    const found = {
      origin: [0, 20, 0] as [number, number, number],
      axis: [1, 0, 0] as [number, number, number],
      radius: 4,
      travel: [-5, 5] as [number, number],
    };
    const hinge = handJoint({ type: 'revolute', parent: base, child: arm, found, parts, joints: [jointOf('hinge_1')] });
    const slider = handJoint({ type: 'prismatic', parent: base, child: arm, found, parts, joints: [] });
    const rig = buildRig([hinge], parts);
    const moved = poseDeltas(rig, { values: { [hinge.id]: 30 } }, ['base', 'arm']);

    expect(hinge).toMatchObject({ id: 'hinge_2', name: 'arm', parent: ['base'], child: ['arm'], range: HINGE_RANGE });
    expect(slider).toMatchObject({ id: 'slider_1', type: 'prismatic', range: [-5, 5] });
    expect(rig.ownerOf.get('arm')).toBe(hinge.id);
    expect(rig.ownerOf.get('base')).toBeUndefined();
    expect([...moved.keys()]).toEqual(['arm']);
  });

  it('removes a joint and edits its range', () => {
    const joints = [jointOf('a'), { ...jointOf('b'), parentJoint: 'a' }];

    expect(withoutJoint(joints, 'a')).toEqual([{ ...jointOf('b'), parentJoint: undefined }]);
    expect(withRange(joints, 'a', [-10, 20])[0].range).toEqual([-10, 20]);
  });
});

function jointOf(id: string): RobotJoint {
  return { id, name: id, type: 'revolute', parent: ['base'], child: ['arm'], origin: [0, 20, 0], axis: [1, 0, 0] };
}
