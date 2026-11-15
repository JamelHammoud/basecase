import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot, goalOf, goalValues } from './caseBuilder';
import { handoffLayout } from './handoffLayout';

const paired = () => {
  const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
  const robot = builderRobot(buildRig(arm.joints, arm.parts), arm.parts);

  return { ...robot, partner: robot };
};

describe('physical handoff geometry', () => {
  it('fits the payload inside both jaw openings and keeps the two grasp regions apart', () => {
    const robot = paired();
    const values = goalValues(goalOf('handoff')!, robot);
    const layout = handoffLayout(robot, values);

    expect(layout.size[0]).toBeLessThan(robot.facts.gripper!.openingMm);
    expect(layout.size[0]).toBeLessThan(robot.partner.facts.gripper!.openingMm);
    expect(layout.size[2]).toBeGreaterThan(layout.size[0] * 2);
    expect(layout.recipient[2] - layout.donor[2]).toBeGreaterThan(layout.size[0]);
    expect(layout.block[1]).toBe(layout.size[1] / 2);
    expect(layout.spot[1]).toBe(layout.size[1] / 2);
  });

  it('refuses an unreachable transfer and a transfer too low to lift', () => {
    const robot = paired();

    expect(buildCase({ goal: 'handoff', world: 'floor', values: { heightMm: 2000 } }, robot).ok).toBe(false);
    expect(buildCase({ goal: 'handoff', world: 'floor', values: { heightMm: 0 } }, robot).ok).toBe(false);
  });

  it('refuses jaws whose travel cannot close on a shared payload', () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const joints = arm.joints.map((j) =>
      j.id.startsWith('finger_') ? { ...j, range: j.range?.map((n) => Math.sign(n)) as [number, number] } : j,
    );
    const shortTravel = builderRobot(buildRig(joints, arm.parts), arm.parts);
    const robot = { ...paired(), partner: shortTravel };

    expect(buildCase({ goal: 'handoff', world: 'floor' }, robot).ok).toBe(false);
  });

  it('refuses a transfer inside the reach sphere when the arm joint limits prevent the grasp', () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const joints = arm.joints.map((j) => (j.id.startsWith('arm') ? { ...j, range: [-1, 1] as [number, number] } : j));
    const limited = builderRobot(buildRig(joints, arm.parts), arm.parts);

    expect(buildCase({ goal: 'handoff', world: 'floor' }, { ...limited, partner: paired() }).ok).toBe(false);
  });

  it('measures rotated jaw faces when sizing the shared block', () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const parts = arm.parts.map((p) =>
      p.id.startsWith('finger_') ? { ...p, rotation: [0, 90, 0] as [number, number, number] } : p,
    );
    const robot = builderRobot(buildRig(arm.joints, parts), parts);

    expect(robot.facts.gripper?.openingMm).toBeCloseTo(38);
    expect(robot.facts.gripper?.closedOpeningMm).toBe(0);
    expect(robot.facts.gripper?.depthMm).toBe(13);
  });

  it('refuses a hand that can reach the block but cannot turn its jaws downward', () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const joints = arm.joints.map((joint, index) =>
      joint.id.startsWith('arm')
        ? {
            ...joint,
            type: 'prismatic' as const,
            axis: (index % 2 ? [0, 0, 1] : [0, 1, 0]) as [number, number, number],
            range: [-500, 500] as [number, number],
          }
        : joint,
    );
    const robot = builderRobot(buildRig(joints, arm.parts), arm.parts);

    expect(robot.facts.gripper).not.toBeNull();
    expect(buildCase({ goal: 'handoff', world: 'floor' }, { ...robot, partner: paired() }).ok).toBe(false);
  });

  it('refuses a gripper whose approach and closing axes cannot form separate grasp regions', () => {
    const robot = paired();
    const partner = {
      ...robot.partner,
      facts: {
        ...robot.partner.facts,
        gripper: { ...robot.partner.facts.gripper!, approach: [1, 0, 0] as [number, number, number] },
      },
    };

    expect(buildCase({ goal: 'handoff', world: 'floor' }, { ...robot, partner }).ok).toBe(false);
  });
});
