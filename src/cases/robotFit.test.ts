import { describe, expect, it } from 'vitest';
import { box, joint } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { boundEffector, robotFacts } from './robotFit';
import { placedRobot, placementOf, robotPivot } from './slots';
import { castSlots } from './caseCast';

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

  it.each([
    { tagged: [], expected: 'elbow' },
    { tagged: ['branch'], expected: 'branch' },
    { tagged: ['elbow'], expected: 'elbow' },
    { tagged: ['elbow', 'branch'], expected: 'elbow' },
    { tagged: ['yaw'], expected: 'elbow' },
  ])('keeps arm priority for $tagged', ({ tagged, expected }) => {
    const { parts, joints } = turretArm();
    const branch = box('branch-part', [100, 250, 0], [20, 100, 20], 50);
    const branches = [
      ...joints,
      joint({
        id: 'branch',
        link: ['upper', branch.id],
        parentJoint: 'shoulder',
        origin: [0, 200, 0],
        axis: [1, 0, 0],
        effortNm: 3,
      }),
    ].map((j) => ({ ...j, limb: tagged.includes(j.id) ? ('arm' as const) : undefined }));
    const allParts = [...parts, branch];
    const rig = buildRig(branches, allParts);
    const before = structuredClone({ joints: branches, parts: allParts });
    const facts = robotFacts(rig, allParts);

    expect(facts.armJoints).toEqual(['yaw', 'shoulder', expected]);
    expect(facts.endEffector?.part).toBe(expected === 'branch' ? branch.id : 'fore');
    expect({ joints: branches, parts: allParts }).toEqual(before);

    const edited = branches.map((j) => ({ ...j, limb: j.id === 'branch' ? ('arm' as const) : undefined }));

    expect(robotFacts(buildRig(edited, allParts), allParts).armJoints).toEqual(['yaw', 'shoulder', 'branch']);
  });

  it('keeps a fixed terminal hand beyond the movable arm chain', () => {
    const { parts, joints } = turretArm();
    const hand = box('hand', [0, 330, 0], [20, 60, 20], 30);
    const terminal = {
      ...joint({
        id: 'terminal',
        link: ['fore', hand.id],
        parentJoint: 'elbow',
        origin: [0, 300, 0],
        axis: [1, 0, 0],
        effortNm: 0,
      }),
      type: 'fixed' as const,
    };
    const allParts = [...parts, hand];
    const facts = robotFacts(buildRig([...joints, terminal], allParts), allParts);

    expect(facts.armJoints).toEqual(['yaw', 'shoulder', 'elbow']);
    expect(facts.endEffector).toEqual({ part: hand.id, point: [0, 360, 0] });
    expect(facts.anchor).toEqual([0, 100, 0]);
    expect(facts.reachMm).toBeCloseTo(260);
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

  it.each(['arm-3dof', 'arm-6dof'])('keeps a joined %s guest bound to its own hand', (id) => {
    const arm = fixtureRobots().find((r) => r.id === id)!;
    const original = robotFacts(buildRig(arm.joints, arm.parts), arm.parts);
    const guest = placedRobot(
      arm,
      placementOf({ id: 'b', pose: { position: [500, 0, 0], yawDeg: 90 } }, robotPivot(arm)),
    );
    const parts = [...arm.parts, ...guest.parts];
    const rig = buildRig([...arm.joints, ...guest.joints], parts);
    const facts = robotFacts(rig, parts, rig.robots.find((r) => r.key.startsWith('b.'))!.key);
    const customPart = guest.parts.find((p) => p.id === facts.endEffector!.part)!;
    const custom = { part: customPart.id, point: customPart.position };
    const slot = { needs: ['arm' as const], binding: { endEffector: original.endEffector! } };
    const cast = castSlots(
      [
        { ...slot, id: 'a' },
        { ...slot, id: 'b' },
      ],
      { rig, parts, guests: [] },
    );

    expect(cast[1].effector).toEqual(facts.endEffector);
    expect(boundEffector({ endEffector: original.endEffector! }, facts, rig)).toEqual(facts.endEffector);
    expect(boundEffector({ endEffector: custom }, facts, rig)).toEqual(custom);
    expect(boundEffector({ endEffector: facts.endEffector! }, original, rig)).toEqual(original.endEffector);
  });
});
