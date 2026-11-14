import { toMj } from '../sim/mjcfFrames';
import type { RobotPoseState } from '../types/robotics';
import {
  bodyCorners,
  bodyPoint,
  chainOf,
  clampJoint,
  isUnder,
  norm,
  reachPoint,
  refresh,
  sub,
  type JointInfo,
  type Kin,
  type V3,
} from './feasibilityKinematics';
import {
  centerOfMass,
  crouch,
  findFeet,
  GRAVITY,
  robotMassKg,
  shareWeight,
  supportMargin,
  type PointLoad,
} from './feasibilityStance';
import { seededRandom } from '../utils/seededRandom';
import { HOLD_LIMIT, holdTorque } from '../utils/holdingTorque';
import { percent } from '../../electron/percent.mjs';
import { torque as torqueText } from '../utils/torque';

export type Basis = 'exact' | 'estimate' | 'sampled';

export interface FeasibilityCheck {
  id: 'holding-torque' | 'support' | 'reach' | 'grip';
  passed: boolean;
  basis: Basis;
  message: string;
  joint?: string;
  ratio?: number;
  marginMm?: number;
}

export interface HoldRequirement {
  poses?: RobotPoseState[];
  payloadKg?: number;
  tipJoint?: string;
}

export interface ReachRequirement {
  targetMm: V3;
  tipJoint: string;
  toleranceMm?: number;
}

export interface GripRequirement {
  objectMm: number;
  jaws: string[];
  fingerMm?: number;
  closedGapMm?: number;
}

const D2R = Math.PI / 180;
const SAMPLES = 2048;
const REFINED = 6;
const GRIP_CLEARANCE_MM = 2;
const CROUCH_SLOP = 0.002;

const mm = (metres: number) => Math.round(metres * 1000);

function jointByName(kin: Kin, id: string): JointInfo {
  const joint = kin.joints.find((j) => j.id === id);

  if (!joint) throw new Error(`The robot has no joint ${id}.`);

  return joint;
}

export function tipOf(kin: Kin, jointId: string): { body: number; local: V3 } {
  const body = jointByName(kin, jointId).body;
  const corners = bodyCorners(kin, body);
  const origin = bodyPoint(kin, body, [0, 0, 0]);
  const far = corners.reduce((best, p) => (norm(sub(p, origin)) > norm(sub(best, origin)) ? p : best), origin);
  const near = corners.filter((p) => norm(sub(p, far)) <= norm(sub(far, origin)) * 0.5);
  const centre = [0, 1, 2].map((k) => near.reduce((s, p) => s + p[k], 0) / Math.max(1, near.length)) as V3;
  const { xpos, xmat } = kin.data;
  const d = sub(centre, [xpos[body * 3], xpos[body * 3 + 1], xpos[body * 3 + 2]]);
  const local = [0, 1, 2].map(
    (c) => xmat[body * 9 + c] * d[0] + xmat[body * 9 + 3 + c] * d[1] + xmat[body * 9 + 6 + c] * d[2],
  ) as V3;

  return { body, local };
}

export function gravityTorques(kin: Kin): number[] {
  const { mj, model, data } = kin;
  const flags = model.opt.disableflags;

  model.opt.disableflags = flags | mj.mjtDisableBit.mjDSBL_CONSTRAINT.value;
  data.qvel.fill(0);
  data.qacc.fill(0);
  mj.mj_inverse(model, data);
  model.opt.disableflags = flags;

  return kin.joints.map((j) => data.qfrc_inverse[j.dof]);
}

const jointAxis = (kin: Kin, j: JointInfo) => ({
  anchor: [0, 1, 2].map((k) => kin.data.xanchor[j.jid * 3 + k]) as V3,
  axis: [0, 1, 2].map((k) => kin.data.xaxis[j.jid * 3 + k]) as V3,
  revolute: j.revolute,
});

function loadTorques(kin: Kin, loads: PointLoad[]): number[] {
  return kin.joints.map((j) => {
    const axis = jointAxis(kin, j);

    return loads
      .filter((load) => isUnder({ model: kin.model, root: j.body }, load.body))
      .reduce((total, load) => total + holdTorque(axis, bodyPoint(kin, load.body, load.local), [0, 0, load.force]), 0);
  });
}

export function holdingTorques(kin: Kin, loads: PointLoad[]): number[] {
  const fromLoads = loadTorques(kin, loads);

  return gravityTorques(kin).map((t, i) => t + fromLoads[i]);
}

function worstJoint(kin: Kin, torques: number[]) {
  return kin.joints
    .map((j, i) => ({ joint: j, torque: Math.abs(torques[i]), ratio: Math.abs(torques[i]) / Math.max(j.effort, 1e-9) }))
    .reduce((a, b) => (b.ratio > a.ratio ? b : a));
}

function stanceLoads(kin: Kin): PointLoad[] {
  const feet = findFeet(kin);
  const points = feet.map((f) => bodyPoint(kin, f.body, f.local));
  const forces = shareWeight(points, centerOfMass(kin), robotMassKg(kin) * GRAVITY);

  return feet.map((f, i) => ({ body: f.body, local: f.local, force: forces[i] }));
}

export function setPose(kin: Kin, pose: RobotPoseState) {
  for (const j of kin.joints) {
    const v = pose.values[j.id];

    if (v !== undefined) kin.data.qpos[j.qpos] = clampJoint(j, j.revolute ? v * D2R : v / 1000);
  }

  refresh(kin);
}

function holdingVerdict(kin: Kin, worst: ReturnType<typeof worstJoint>, what: string): FeasibilityCheck {
  const { joint, torque, ratio } = worst;
  const common = { id: 'holding-torque' as const, joint: joint.id, ratio };

  const basis = kin.robot.floating ? 'estimate' : 'exact';
  const share = `${percent(ratio)} of its servo’s ${torqueText(joint.effort)}`;

  if (ratio > HOLD_LIMIT)
    return {
      ...common,
      passed: false,
      basis,
      message: `Too weak to ${what}: ${joint.id} needs ${torqueText(torque)}, ${share}. A servo holds for long only up to ${percent(HOLD_LIMIT)}.`,
    };

  return {
    ...common,
    passed: true,
    basis,
    message: `Strong enough to ${what}: the hardest-working joint, ${joint.id}, needs ${share}.`,
  };
}

export function standTorqueCheck(kin: Kin): FeasibilityCheck {
  const upright = worstJoint(kin, holdingTorques(kin, stanceLoads(kin)));
  const gap = crouch(kin, findFeet(kin));

  if (gap > CROUCH_SLOP) return holdingVerdict(kin, upright, 'stand');

  const crouched = worstJoint(kin, holdingTorques(kin, stanceLoads(kin)));

  return holdingVerdict(kin, crouched.ratio > upright.ratio ? crouched : upright, 'stand in a slight crouch');
}

export function holdTorqueCheck(kin: Kin, hold: HoldRequirement): FeasibilityCheck {
  const poses = hold.poses?.length ? hold.poses : [kin.sim.initial];
  const tip = hold.payloadKg && hold.tipJoint ? tipOf(kin, hold.tipJoint) : null;
  const loads: PointLoad[] = tip ? [{ ...tip, force: -(hold.payloadKg ?? 0) * GRAVITY }] : [];
  const worst = poses
    .map((pose) => {
      setPose(kin, pose);

      return worstJoint(kin, holdingTorques(kin, loads));
    })
    .reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const what = hold.payloadKg ? `hold ${hold.payloadKg} kg in these poses` : 'hold these poses';

  return holdingVerdict(kin, worst, what);
}

export function supportCheck(kin: Kin): FeasibilityCheck {
  const sole = findFeet(kin).flatMap((f) => f.sole);
  const margin = supportMargin(sole, centerOfMass(kin));
  const marginMm = mm(margin);

  if (margin <= 0)
    return {
      id: 'support',
      passed: false,
      basis: 'exact',
      marginMm,
      message: `It tips over: its center of mass is ${-marginMm} mm outside its feet.`,
    };

  return {
    id: 'support',
    passed: true,
    basis: 'exact',
    marginMm,
    message: `Balanced: its center of mass sits ${marginMm} mm inside its feet.`,
  };
}

function reachBound(kin: Kin, joints: JointInfo[], tip: { body: number; local: V3 }): number {
  const anchors = joints.map((j) => [0, 1, 2].map((k) => kin.data.xanchor[j.jid * 3 + k]) as V3);
  const points = [...anchors, bodyPoint(kin, tip.body, tip.local)];
  const travel = joints.filter((j) => !j.revolute && j.range).reduce((s, j) => s + (j.range![1] - j.range![0]), 0);

  return points.slice(1).reduce((s, p, i) => s + norm(sub(p, points[i])), 0) + travel;
}

function randomPose(kin: Kin, joints: JointInfo[], random: () => number) {
  for (const j of joints) {
    const [lo, hi] = j.range ?? [-Math.PI, Math.PI];

    kin.data.qpos[j.qpos] = lo + (hi - lo) * random();
  }

  refresh(kin);
}

function bestSamples(kin: Kin, options: { joints: JointInfo[]; tip: { body: number; local: V3 }; target: V3 }) {
  const { joints, tip, target } = options;
  const random = seededRandom('5eedc0de5eedc0de5eedc0de5eedc0de');
  const samples: Array<{ gap: number; q: number[] }> = [];

  for (let i = 0; i < SAMPLES; i++) {
    randomPose(kin, joints, random);
    samples.push({
      gap: norm(sub(target, bodyPoint(kin, tip.body, tip.local))),
      q: joints.map((j) => kin.data.qpos[j.qpos]),
    });
  }

  return samples.sort((a, b) => a.gap - b.gap).slice(0, REFINED);
}

export function reachCheck(kin: Kin, reach: ReachRequirement): FeasibilityCheck {
  const tip = tipOf(kin, reach.tipJoint);
  const joints = chainOf(kin, tip.body);
  const target = toMj(reach.targetMm);
  const tolerance = (reach.toleranceMm ?? 5) / 1000;
  const bound = reachBound(kin, joints, tip);
  const base = joints.length ? ([0, 1, 2].map((k) => kin.data.xanchor[joints[0].jid * 3 + k]) as V3) : null;
  const fromBase = base ? norm(sub(target, base)) : Infinity;

  if (fromBase - bound > tolerance)
    return {
      id: 'reach',
      passed: false,
      basis: 'exact',
      message: `Out of reach: the target is ${mm(fromBase)} mm from the first joint, and the arm reaches at most ${mm(bound)} mm.`,
    };

  const gap = Math.min(
    ...bestSamples(kin, { joints, tip, target }).map((s) => {
      joints.forEach((j, i) => (kin.data.qpos[j.qpos] = s.q[i]));
      refresh(kin);

      return reachPoint(kin, { ...tip, target, joints });
    }),
  );

  if (gap > tolerance)
    return {
      id: 'reach',
      passed: false,
      basis: 'sampled',
      message: `Out of reach within its joint ranges: the closest pose found stops ${mm(gap)} mm short.`,
    };

  return { id: 'reach', passed: true, basis: 'sampled', message: 'Reaches the target within its joint ranges.' };
}

export function gripCheck(kin: Kin, grip: GripRequirement): FeasibilityCheck {
  const jaws = grip.jaws.map((id) => jointByName(kin, id));
  const finger = (grip.fingerMm ?? 0) / 1000;
  const span = (j: JointInfo) => (j.range ? j.range[1] - j.range[0] : 2 * Math.PI);
  const opening =
    (grip.closedGapMm ?? 0) / 1000 +
    jaws.reduce((s, j) => s + (j.revolute ? 2 * finger * Math.sin(Math.min(Math.PI, span(j)) / 2) : span(j)), 0);
  const needed = (grip.objectMm + GRIP_CLEARANCE_MM) / 1000;

  if (opening < needed)
    return {
      id: 'grip',
      passed: false,
      basis: 'exact',
      message: `The gripper opens ${mm(opening)} mm, and a ${grip.objectMm} mm object needs ${mm(needed)} mm.`,
    };

  return {
    id: 'grip',
    passed: true,
    basis: 'exact',
    message: `The gripper opens ${mm(opening)} mm, enough for ${grip.objectMm} mm.`,
  };
}
