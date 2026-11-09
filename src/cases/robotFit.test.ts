import { describe, expect, it } from 'vitest';
import { box, joint } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { boundEffector, robotFacts } from './robotFit';

function turretArm() {
  const parts = [
    box('stand', [0, 30, 0], [100, 60, 100], 500),
    box('turret', [0, 80, 0], [40, 40, 40], 80),
    box('upper', [0, 150, 0], [20, 100, 20], 60),
    box('fore', [0, 250, 0], [20, 100, 20], 50),
  ];
  const joints = [
    joint({ id: 'yaw', link: ['stand', 'turret'], origin: [0, 60, 0], axis: [0, 1, 0], effortNm: 3, limb: 'arm' }),
    joint({ id: 'shoulder', link: ['turret', 'upper'], origin: [0, 100, 0], axis: [1, 0, 0], effortNm: 3 }),
    joint({ id: 'elbow', link: ['upper', 'fore'], origin: [0, 200, 0], axis: [1, 0, 0], effortNm: 3 }),
  ];

  joints[1].parentJoint = 'yaw';
  joints[2].parentJoint = 'shoulder';

  return { parts, joints };
}

describe('robot fit', () => {
  it('measures an arm’s reach from the first joint that swings its hand, not a yaw under it', () => {
    const { parts, joints } = turretArm();
    const facts = robotFacts(buildRig(joints, parts), parts);

    expect(facts.armJoints).toEqual(['yaw', 'shoulder', 'elbow']);
    expect(facts.anchor).toEqual([0, 100, 0]);
    expect(facts.reachMm).toBeCloseTo(200);
  });

  it('binds an authored hand only where that part ends a chain and holds the point', () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const rig = buildRig(arm.joints, arm.parts);
    const facts = robotFacts(rig, arm.parts);
    const own = facts.endEffector!;

    expect(boundEffector({ endEffector: own }, facts, rig)).toEqual(own);
    expect(boundEffector({ endEffector: { part: own.part, point: [0, 900, 0] } }, facts, rig)).toEqual(own);
    expect(boundEffector({ endEffector: { part: 'link2', point: [0, 260, 0] } }, facts, rig)).toEqual(own);
  });
});
