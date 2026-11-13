import { classifyRobot } from '../sim/morphology';
import type { RobotJoint } from '../types/robotics';
import { fmtG } from './engineeringFormat';
import { boxCorners, sub, type V3 } from './engineeringMath';
import { downstreamOf, massOf } from './engineeringMass';
import { jointRating } from './engineeringTorque';
import type { CheckContext, CheckDot, CheckRow } from './engineeringTypes';
import { buildRig, isMovable, type Rig, type RobotGroup } from './kinematicsRig';
import { payloadMap, type ArmModel, type PayloadMap } from './payload';

export const PAYLOAD_CHECK = 'Payload';

const GRIPPER = /grip|jaw|finger|claw|thumb/i;
const FULL_TURN: [number, number] = [-180, 180];
const TOP_SHARE = 0.95;

const length = (v: V3) => Math.hypot(v[0], v[1], v[2]);

function tipJointOf(rig: Rig, joints: RobotJoint[]): RobotJoint | undefined {
  const reach = (j: RobotJoint) => length(sub(j.origin, joints[0].origin));
  const deeper = (a: RobotJoint, b: RobotJoint) => {
    const da = rig.depth.get(a.id) ?? 0;
    const db = rig.depth.get(b.id) ?? 0;

    return db > da || (db === da && reach(b) > reach(a)) ? b : a;
  };
  const candidates = joints.filter((j) => !GRIPPER.test(`${j.name} ${j.id}`));

  return candidates.length ? candidates.reduce(deeper) : undefined;
}

function chainTo(rig: Rig, tip: RobotJoint): RobotJoint[] {
  const chain: RobotJoint[] = [];

  for (let id: string | null | undefined = tip.id; id; id = rig.parentOf.get(id)) {
    const joint = rig.byId.get(id);

    if (joint && isMovable(joint)) chain.unshift(joint);
  }

  return chain;
}

function handPoint(ctx: CheckContext, tip: RobotJoint): V3 | null {
  const corners = [...downstreamOf(tip, ctx.joints)].flatMap((id) => {
    const m = ctx.measures[id];

    return m ? boxCorners(m.min, m.max) : [];
  });

  if (!corners.length) return null;

  const from = (p: V3) => length(sub(p, tip.origin));
  const far = corners.reduce((best, p) => (from(p) > from(best) ? p : best));
  const near = corners.filter((p) => length(sub(p, far)) <= from(far) * 0.5);

  return [0, 1, 2].map((k) => near.reduce((s, p) => s + p[k], 0) / near.length) as V3;
}

function linksOf(ctx: CheckContext, chain: RobotJoint[], volts?: number): ArmModel['links'] | null {
  const carried = chain.map((j) => downstreamOf(j, ctx.joints));
  const stalls = chain.map((j) => jointRating(ctx, j, volts)?.stallNm ?? j.effortNm);

  if (stalls.some((s) => !s)) return null;

  return chain.map((j, i) => {
    const owned = [...carried[i]].filter((id) => !carried[i + 1]?.has(id));
    const mass = massOf(owned, ctx.byId);
    const revolute = j.type === 'revolute';

    return {
      anchor: j.origin,
      axis: j.axis,
      revolute,
      range: j.range ?? (revolute ? FULL_TURN : [0, 0]),
      stallNm: stalls[i]!,
      massKg: mass.grams / 1000,
      com: mass.com,
    };
  });
}

function armOf(ctx: CheckContext, rig: Rig, robot: RobotGroup, volts?: number): ArmModel | null {
  if (classifyRobot(robot, rig, ctx.byPart) !== 'fixed') return null;

  const joints = rig.joints.filter((j) => rig.robotOf.get(j.id) === robot.key && isMovable(j));
  const tipJoint = joints.length ? tipJointOf(rig, joints) : undefined;
  const chain = tipJoint ? chainTo(rig, tipJoint) : [];
  const tip = tipJoint && handPoint(ctx, tipJoint);

  if (chain.length < 2 || !tip) return null;

  const links = linksOf(ctx, chain, volts);

  return links && { links, tip, floorY: 0 };
}

function dotsOf(map: PayloadMap): CheckDot[] {
  const finite = map.samples
    .map((s) => s.kg)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const top = finite[Math.floor((finite.length - 1) * TOP_SHARE)] || 1;

  return map.samples.map((s) => ({ at: s.at, shade: Math.min(1, s.kg / top) }));
}

const payloadText = (map: PayloadMap) =>
  `${fmtG(map.fullReachKg * 1000)} at full reach, ${fmtG(map.closeInKg * 1000)} close in`;

export function payloadRows(ctx: CheckContext, volts?: number): CheckRow[] {
  const rig = buildRig(ctx.joints, ctx.parts);
  const measure = ctx.input.payload ?? payloadMap;
  const maps = rig.robots.flatMap((robot) => {
    const arm = armOf(ctx, rig, robot, volts);
    const map = arm && measure(arm);

    return map && Number.isFinite(map.fullReachKg) && Number.isFinite(map.closeInKg) ? [{ robot, map }] : [];
  });

  if (!maps.length) return [];

  const detail = maps
    .map(({ robot, map }) => (maps.length > 1 ? `${robot.name}: ${payloadText(map)}` : payloadText(map)))
    .join('. ');

  return [{ check: PAYLOAD_CHECK, status: 'pass', detail, dots: maps.flatMap(({ map }) => dotsOf(map)) }];
}
