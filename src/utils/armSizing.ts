import { armSkeleton, armTemplate } from '../../electron/cad-mcp/recipes/templates.mjs';
import { buildSkeleton, type SkeletonPayload } from '../agent/skeleton';
import { componentWeightG } from '../data/components';
import type { RobotSkeleton, ZUpVec } from '../types/skeleton';
import { anglesTo, innerRange, type ArmShape } from './armReach';
import { searchArm, type ArmCandidate } from './armSearch';
import { armServos, type ServoPick } from './armServos';
import { reachWithTip, skeletonRig } from './skeletonRig';

export interface ArmTarget {
  id: string;
  name: string;
  at: ZUpVec;
}

export interface ArmRequest {
  targets: ArmTarget[];
  payloadG: number;
  base?: ZUpVec;
}

export interface TargetReach {
  id: string;
  errorMm: number;
  angles: Record<string, number>;
}

export interface SizedArm {
  shape: ArmShape;
  servos: ServoPick;
  reach: TargetReach[];
  skeleton: SkeletonPayload;
}

export type ArmSizing = { arm: SizedArm } | { problem: string; target?: string };

export const MAX_TARGETS = 8;
export const REACH_MM = 2;

const LINK_G = 15;
const LINK_G_PER_MM = 0.35;
const FLANGE_G = 15;
const BASE_G = 150;
const SERVO_G = 55;

const DEG = 180 / Math.PI;

export function facingYaw(base: ZUpVec, targets: ZUpVec[]): number {
  const bearings = targets
    .map((at) => [at[0] - base[0], at[1] - base[1]])
    .filter(([x, y]) => Math.hypot(x, y) > 1)
    .map(([x, y]) => Math.atan2(y, x) * DEG)
    .sort((a, b) => a - b);

  if (!bearings.length) return 0;

  const gaps = bearings.map((b, i) => (i ? b - bearings[i - 1] : b + 360 - bearings[bearings.length - 1]));
  const widest = gaps.indexOf(Math.max(...gaps));
  const arc = 360 - gaps[widest];

  return Math.round(bearings[widest] + arc / 2 + 90);
}

const linkGrams = (mm: number) => Math.round(LINK_G + LINK_G_PER_MM * mm);

const servoGrams = (key?: string) => (key && componentWeightG(key.split('|')[0].replace(/^component:/, ''))) || SERVO_G;

export function armPayload(shape: ArmShape, payloadG: number, actuators: string[] = []): SkeletonPayload {
  const options = { ...shape, servos: actuators };
  const tool = armTemplate(options).tool;
  const plan = armSkeleton(options);
  const links = [...shape.links.map(linkGrams), FLANGE_G];
  const last = plan.joints.length - 1;
  const servos = plan.joints.reduce((s, j) => s + servoGrams(j.actuator), 0);

  return {
    ...plan,
    mass_g: Math.round(BASE_G + servos + links.reduce((s, g) => s + g, 0) + payloadG),
    joints: plan.joints.map((j, i) => ({
      ...j,
      link_mass_g: links[i],
      ...(i === last ? { tip: tool, payload_g: payloadG } : {}),
    })),
  };
}

export function armTip(skeleton: RobotSkeleton) {
  const last = skeleton.joints[skeleton.joints.length - 1];

  return { joint: last.id, point: last.tip ?? last.origin };
}

function reachAll(skeleton: RobotSkeleton, shape: ArmShape, targets: ArmTarget[]): TargetReach[] | null {
  const rig = skeletonRig(skeleton, (j) => j.range && innerRange(j.range));
  const tip = armTip(skeleton);
  const out: TargetReach[] = [];

  for (const t of targets) {
    const seed = anglesTo(shape, t.at);
    const solved = seed && reachWithTip(rig, tip, t.at, seed);

    if (!solved || solved.errorMm > REACH_MM) return null;

    out.push({ id: t.id, errorMm: solved.errorMm, angles: solved.values });
  }

  return out;
}

const confirmReach = (req: ArmRequest) => (c: ArmCandidate) =>
  reachAll(buildSkeleton(armPayload(c.shape, req.payloadG)).skeleton, c.shape, req.targets) !== null;

function sizedArm(shape: ArmShape, req: ArmRequest): ArmSizing {
  const servos = armServos(buildSkeleton(armPayload(shape, req.payloadG)).skeleton);

  if ('joint' in servos) return { problem: `No servo that fits the links can hold the ${servos.joint}.` };

  const skeleton = armPayload(shape, req.payloadG, servos.keys);
  const reach = reachAll(buildSkeleton(skeleton).skeleton, shape, req.targets) ?? [];

  return { arm: { shape, servos, reach, skeleton } };
}

const distance = (a: ZUpVec, b: ZUpVec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const farthest = (base: ZUpVec, targets: ArmTarget[]) =>
  targets.reduce((far, t) => (distance(t.at, base) > distance(far.at, base) ? t : far));

export function sizeArm(req: ArmRequest): ArmSizing {
  if (!req.targets.length || req.targets.length > MAX_TARGETS) return { problem: `Give 1 to ${MAX_TARGETS} targets.` };

  const base = req.base ?? [0, 0, 0];
  const targets = req.targets.map((t) => t.at);
  const yaw = facingYaw(base, targets);
  const found = searchArm({ base, yaw, targets, confirm: confirmReach(req) });

  if ('shape' in found) return sizedArm(found.shape, req);

  const blamed = found.blame === null ? farthest(base, req.targets) : req.targets[found.blame];

  return { problem: `${blamed.name} is out of reach.`, target: blamed.id };
}
