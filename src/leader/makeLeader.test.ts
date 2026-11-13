import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { sourcingFindings } from '../readiness/buildChecks';
import { bomFindings } from '../readiness/findings';
import { box, joint, type FixtureRobot, type P3 } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { buildBom } from '../utils/bom';
import { buildRig, forwardKinematics, isMovable, resolveJoints } from '../utils/kinematics';
import { followerArm, followerArms } from './leaderArm';
import { stepMatrix } from './leaderCode';
import { chainReach, frameMatrix, leaderFrames, MIN_LINK_MM } from './leaderFrames';
import { LEADER_SERVO, makeLeader, type Leader } from './makeLeader';

const X: P3 = [1, 0, 0];
const Y: P3 = [0, 1, 0];
const Z: P3 = [0, 0, 1];

interface Link {
  id: string;
  axis: P3;
  origin: P3;
  type?: RobotJoint['type'];
  range?: [number, number];
}

function serialArm(id: string, links: Link[]): FixtureRobot {
  const parts = [box('base', [0, 20, 0], [120, 40, 120], 600)];
  const joints: RobotJoint[] = [];

  links.forEach((l, i) => {
    const end = links[i + 1]?.origin ?? [l.origin[0], l.origin[1] + 40, l.origin[2]];
    const mid: P3 = [(l.origin[0] + end[0]) / 2, (l.origin[1] + end[1]) / 2, (l.origin[2] + end[2]) / 2];

    parts.push(box(`${l.id}_link`, mid, [30, 30, 30], 120));
    joints.push({
      ...joint({
        id: l.id,
        link: [i ? `${links[i - 1].id}_link` : 'base', `${l.id}_link`],
        origin: l.origin,
        axis: l.axis,
        effortNm: 5,
        parentJoint: i ? links[i - 1].id : undefined,
        range: l.range ?? [-120, 120],
        limb: 'arm',
      }),
      type: l.type ?? 'revolute',
    });
  });

  return { id, parts, joints, expect: { morphology: 'fixed', stand: 'n/a', walk: 'n/a' } };
}

const deskArm = () =>
  serialArm('desk-arm', [
    { id: 'base_yaw', axis: Y, origin: [0, 60, 0], range: [-110, 110] },
    { id: 'shoulder_pitch', axis: X, origin: [0, 140, 0], range: [-100, 100] },
    { id: 'elbow_pitch', axis: X, origin: [0, 256, 0], range: [-110, 110] },
    { id: 'wrist_pitch', axis: X, origin: [0, 372, 0], range: [-110, 110] },
    { id: 'gripper', axis: Z, origin: [0, 410, 0], range: [0, 90] },
  ]);

const urArm = () =>
  serialArm('ur-arm', [
    { id: 'shoulder_pan', axis: Y, origin: [0, 90, 0] },
    { id: 'shoulder_lift', axis: X, origin: [0, 180, 0] },
    { id: 'elbow', axis: X, origin: [0, 605, 0] },
    { id: 'wrist_1', axis: X, origin: [0, 997, 0] },
    { id: 'wrist_2', axis: Y, origin: [0, 997, 110] },
    { id: 'wrist_3', axis: Z, origin: [0, 1092, 110], range: [-180, 180] },
    { id: 'finger', axis: X, origin: [0, 1092, 200], type: 'prismatic', range: [0, 40] },
  ]);

const so101Sized = () =>
  serialArm('so101-sized', [
    { id: 'shoulder_pan', axis: Y, origin: [0, 60, 0] },
    { id: 'shoulder_lift', axis: X, origin: [0, 110, 20] },
    { id: 'elbow_flex', axis: X, origin: [0, 220, 40] },
    { id: 'wrist_flex', axis: X, origin: [0, 220, 175] },
    { id: 'wrist_roll', axis: Z, origin: [0, 220, 235] },
    { id: 'gripper', axis: X, origin: [10, 220, 270] },
  ]);

const arm6 = () => fixtureRobots().find((r) => r.id === 'arm-6dof')!;
const ARMS = [arm6(), deskArm(), urArm(), so101Sized()];

const leaderOf = (r: FixtureRobot) => makeLeader({ parts: r.parts, joints: r.joints, sceneId: 'scene-follower' })!;
const movable = (joints: RobotJoint[]) => joints.filter(isMovable);
const unit = (v: number[]) => new THREE.Vector3(...v).normalize();

function tipRotation(parts: ScenePart[], joints: RobotJoint[], values: Record<string, number>, tip: string) {
  const rig = buildRig(resolveJoints(joints, parts), parts);

  return new THREE.Quaternion().setFromRotationMatrix(forwardKinematics(rig, { values }).joint.get(tip)!);
}

function randomValues(joints: RobotJoint[], seed: number): Record<string, number> {
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) % 2147483648;

    return s / 2147483648;
  };

  return Object.fromEntries(
    movable(joints).map((j) => {
      const [lo, hi] = j.range ?? [-180, 180];

      return [j.id, lo + (hi - lo) * next()];
    }),
  );
}

const armReach = (leader: Leader, r: FixtureRobot) => {
  const follower = followerArm(r.parts, r.joints)!;
  const ids = new Set(follower.arm.map((j) => j.id));
  const origins = (js: RobotJoint[]) => js.filter((j) => ids.has(j.id)).map((j) => j.origin);

  return chainReach(origins(leader.joints)) / chainReach(origins(follower.arm));
};

describe.each(ARMS)('the leader of $id', (robot) => {
  const leader = leaderOf(robot);

  it('has the same movable joints in the same order, with the same types, axes and limits', () => {
    const want = movable(robot.joints);
    const got = movable(leader.joints);

    expect(got.map((j) => [j.id, j.type, j.range])).toEqual(want.map((j) => [j.id, j.type, j.range]));
    got.forEach((j, i) => expect(unit(j.axis).angleTo(unit(want[i].axis))).toBeLessThan(1e-9));
  });

  it('points its end effector the way the follower points at random joint values', () => {
    const tip = movable(robot.joints).at(-1)!.id;

    for (let seed = 1; seed <= 25; seed++) {
      const values = randomValues(robot.joints, seed);
      const follower = tipRotation(robot.parts, robot.joints, values, tip);
      const ours = tipRotation(leader.parts, leader.joints, values, tip);

      expect(ours.angleTo(follower)).toBeLessThan(1e-6);
    }
  });

  it('lists one XL330 per joint, and Checks find no part without a source', () => {
    const bom = buildBom({ parts: leader.parts, project: { ...DEFAULT_PROJECT }, purchases: {}, measures: {} });
    const blockers = [...bomFindings(bom), ...sourcingFindings(bom)].filter((f) => f.level === 'blocker');

    expect(bom.lines.find((l) => l.key === LEADER_SERVO)?.qty).toBe(movable(leader.joints).length);
    expect(bom.standIns).toEqual([]);
    expect(blockers).toEqual([]);
  });

  it('holds every joint between parts that exist and drives it with its own servo', () => {
    const ids = new Set(leader.parts.map((p) => p.id));
    const servos = leader.joints.flatMap((j) => j.actuators ?? []);

    for (const j of leader.joints)
      expect(
        [...j.parent, ...j.child].every((id) => ids.has(id)),
        j.id,
      ).toBe(true);

    expect(new Set(servos).size).toBe(leader.joints.length);
    expect(leader.parts.filter((p) => p.cad).every((p) => p.cad!.pending && p.cad!.code.includes('XL330'))).toBe(true);
  });

  it('records which arm and joints it leads', () => {
    expect(leader.leads.sceneId).toBe('scene-follower');
    expect(Object.entries(leader.leads.joints)).toEqual(movable(robot.joints).map((j) => [j.id, j.id]));
  });

  it('puts each cradle where the link before it ends', () => {
    const follower = followerArm(robot.parts, robot.joints)!;
    const frames = leaderFrames(follower.arm);

    frames.links.forEach((link, i) => {
      const end = frameMatrix(frames.joints[i]).multiply(stepMatrix(link));

      expect(maxDiff(end, frameMatrix(frames.cradles[i + 1]))).toBeLessThan(0.01);
      expect(link.length).toBeGreaterThanOrEqual(MIN_LINK_MM);
    });
  });
});

function maxDiff(a: THREE.Matrix4, b: THREE.Matrix4) {
  return Math.max(...a.elements.map((v, i) => Math.abs(v - b.elements[i])));
}

describe('reach', () => {
  it.each([deskArm(), urArm()])('scales $id to about half its reach', (robot) => {
    const ratio = armReach(leaderOf(robot), robot);

    expect(ratio).toBeGreaterThanOrEqual(0.45);
    expect(ratio).toBeLessThanOrEqual(0.55);
  });
});

describe('which robots get a leader', () => {
  it('leads fixed-base arms only', () => {
    const leadable = fixtureRobots().filter((r) => followerArms(r.parts, r.joints).length);

    expect(leadable.map((r) => r.id)).toEqual(['arm-3dof', 'arm-6dof']);
  });

  it('takes a gripper as the trigger, and leaves an arm without one with a bare handle', () => {
    expect(followerArm(deskArm().parts, deskArm().joints)?.gripper?.id).toBe('gripper');
    expect(followerArm(arm6().parts, arm6().joints)?.gripper).toBeNull();
    expect(leaderOf(arm6()).parts.some((p) => p.id === 'leader-trigger')).toBe(false);
    expect(leaderOf(urArm()).joints.at(-1)).toMatchObject({
      id: 'finger',
      type: 'prismatic',
      child: ['leader-trigger'],
    });
  });
});
