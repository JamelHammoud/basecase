import * as THREE from 'three';
import {
  ARM_FLANGE,
  ARM_MASS_G,
  ARM_SHOULDER_MM,
  armTemplate,
  templateSkeleton,
  type ServoTemplate,
} from '../../electron/cad-mcp/recipes/templates.mjs';
import { buildSkeleton, type SkeletonPayload } from '../agent/skeleton';
import type { JointValues } from '../types/robotics';
import type { RobotSkeleton, ZUpVec } from '../types/skeleton';
import { armServoOptions } from './armServos';
import {
  bearingDeg,
  planarPose,
  planeTargets,
  sweepBounds,
  wrapDeg,
  type ArmGeometry,
  type ArmShape,
  type PlanarPose,
  type PlaneTarget,
} from './armPlanar';
import { innerRange, REACH_MM, reachTargets } from './armReach';
import { sizeActuators, type Family } from './actuatorSizing';
import { skeletonSizing } from './skeletonSizing';

export const ARM_LINK = { min: 75, max: 300, step: 5 };
export const ARM_RISER_MAX = 300;
export const MAX_TARGETS = 8;

const SCAN_DEG = 1;
const SEED_DEG = 0.25;
const DEFAULT_LINKS = 232;
const DEG = Math.PI / 180;

export interface ArmSizingInput {
  targets: ZUpVec[];
  payloadG: number;
  base?: ZUpVec;
}

export interface ArmServoPick {
  joint: string;
  name: string;
  servo: string;
  servoName: string;
  usd: number;
  stallShare: number;
}

export interface SizedArm {
  base: ZUpVec;
  heading: number;
  shape: ArmShape;
  shoulderMm: number;
  payloadG: number;
  picks: ArmServoPick[];
  rail: string;
  volts: number;
  servosUsd: number;
  costUsd: number;
  template: ServoTemplate;
  skeleton: SkeletonPayload;
  poses: JointValues[];
  errorsMm: number[];
}

export type ArmSizing =
  | { ok: true; arm: SizedArm }
  | { ok: false; reason: 'reach'; target: number; distanceMm: number }
  | { ok: false; reason: 'load'; joint: string };

type PartPose = { position: number[]; rotation: number[] };

const matrixOf = ({ position, rotation }: PartPose) =>
  new THREE.Matrix4()
    .makeRotationFromEuler(new THREE.Euler(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG, 'XYZ'))
    .setPosition(position[0], position[1], position[2]);

function toolPoint(template: ServoTemplate): ZUpVec {
  const flange = template.parts.find((p) => p.id === 'wrist-flange')!;
  const at = ARM_FLANGE.clone().applyMatrix4(matrixOf(flange));

  return [at.x, at.y, at.z].map((v) => Math.round(v * 100) / 100) as ZUpVec;
}

function restGeometry(): ArmGeometry {
  const template = armTemplate();
  const joints = templateSkeleton(template, { limb: 'arm', massG: ARM_MASS_G }).joints;
  const shoulder = joints[1].origin;
  const tool = toolPoint(template);
  const ranges = template.joints.map((j) => innerRange(j.range));

  return {
    shoulderMm: Math.abs(shoulder[1]),
    shoulderZ: shoulder[2],
    toolMm: Math.abs(tool[1]) - ARM_SHOULDER_MM - DEFAULT_LINKS,
    toolSideMm: tool[0],
    yaw: ranges[0],
    pitch: ranges.slice(1),
  };
}

export const ARM_GEOMETRY = restGeometry();

function headingFor(base: ZUpVec, targets: ZUpVec[]): number {
  const bearings = targets.map((t) => (bearingDeg(base, t) + 360) % 360).sort((a, b) => a - b);
  let gapAt = bearings.length - 1;
  let gap = bearings[0] + 360 - bearings[bearings.length - 1];

  for (let i = 0; i + 1 < bearings.length; i++) {
    if (bearings[i + 1] - bearings[i] <= gap) continue;

    gap = bearings[i + 1] - bearings[i];
    gapAt = i;
  }

  const start = bearings[(gapAt + 1) % bearings.length];
  const span = 360 - gap;

  return Math.round(wrapDeg(start + span / 2)) || 0;
}

function linkPairs(links: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const { min, max, step } = ARM_LINK;

  for (let u = Math.max(min, links - max); u <= Math.min(max, links - min); u += step) out.push([u, links - u]);

  return out.sort((a, b) => Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]) || a[0] - b[0]);
}

export function* armShapes(): Generator<ArmShape> {
  const { min, max, step } = ARM_LINK;

  for (let total = 2 * min; total <= 2 * max + ARM_RISER_MAX; total += step)
    for (let riser = 0; riser <= Math.min(ARM_RISER_MAX, total - 2 * min); riser += step)
      for (const [upperArm, forearm] of linkPairs(total - riser)) yield { upperArm, forearm, riser };
}

function poseFor(options: PlaneTarget[], shape: ArmShape, stepDeg = SCAN_DEG): PlanarPose | null {
  const found = options.map((o) => planarPose(ARM_GEOMETRY, o, shape, { stepDeg, best: stepDeg !== SCAN_DEG }));

  return found.reduce<PlanarPose | null>((best, p) => (p && (!best || p.slack > best.slack) ? p : best), null);
}

export function shapeReaches(options: PlaneTarget[][], shape: ArmShape, stepDeg = SCAN_DEG): boolean {
  return options.every((o) => poseFor(o, shape, stepDeg));
}

const maxRiserReach = (o: PlaneTarget) => {
  const g = ARM_GEOMETRY;
  const z = Math.min(Math.max(o.z - g.shoulderZ, 0), ARM_RISER_MAX);
  const { lo } = sweepBounds(g, o, z, SCAN_DEG);

  return lo <= 2 * ARM_LINK.max;
};

function farthest(base: ZUpVec, targets: ZUpVec[]) {
  const dist = targets.map((t) => Math.hypot(t[0] - base[0], t[1] - base[1], t[2] - base[2]));
  const target = dist.indexOf(Math.max(...dist));

  return { ok: false as const, reason: 'reach' as const, target, distanceMm: Math.round(dist[target]) };
}

function shortestShape(options: PlaneTarget[][]): ArmShape | null {
  let order = options.map((_, i) => i);

  for (const shape of armShapes()) {
    const miss = order.find((i) => !poseFor(options[i], shape));

    if (miss === undefined) return shape;

    order = [miss, ...order.filter((i) => i !== miss)];
  }

  return null;
}

const massOf = (shape: ArmShape) =>
  Math.round((ARM_MASS_G * (ARM_SHOULDER_MM + shape.upperArm + shape.forearm)) / (ARM_SHOULDER_MM + DEFAULT_LINKS));

function armSkeleton(template: ServoTemplate, shape: ArmShape, payloadG: number): SkeletonPayload {
  const payload = templateSkeleton(template, { limb: 'arm', massG: massOf(shape) });
  const last = payload.joints.length - 1;

  return {
    ...payload,
    joints: payload.joints.map((j, i) => (i === last ? { ...j, tip: toolPoint(template), payload_g: payloadG } : j)),
  };
}

export function shapedSkeleton(shape: ArmShape, arm: Pick<SizedArm, 'base' | 'heading' | 'payloadG'>): SkeletonPayload {
  return armSkeleton(armTemplate({ ...shape, at: arm.base, heading: arm.heading }), shape, arm.payloadG);
}

function cheapestFamily(skeleton: RobotSkeleton): Family | string {
  const input = skeletonSizing(skeleton);

  if (typeof input === 'string') return input;

  const families = sizeActuators({ ...input, options: armServoOptions() });
  const passing = families.find((f) => !f.failures.length);

  return passing ?? families[0]?.failures[0]?.joint.name ?? input.joints[0].name;
}

function picksOf(family: Family): ArmServoPick[] {
  return family.picks.map((p) => ({
    joint: p.joint.id,
    name: p.joint.name,
    servo: p.pick!.option.key,
    servoName: p.pick!.option.name,
    usd: p.pick!.option.usd,
    stallShare: p.pick!.stallShare,
  }));
}

interface Solved {
  base: ZUpVec;
  heading: number;
  shape: ArmShape;
  options: PlaneTarget[][];
}

function seedsOf(solved: Solved, ids: string[]): JointValues[] {
  return solved.options.map((o) => {
    const pose = poseFor(o, solved.shape, SEED_DEG)!;

    return Object.fromEntries(ids.map((id, i) => [id, i === 0 ? pose.yaw : pose.pitch[i - 1]]));
  });
}

function sizedArm(solved: Solved, input: ArmSizingInput): ArmSizing {
  const { base, heading, shape } = solved;
  const at = { ...shape, at: base, heading };
  const first = armSkeleton(armTemplate(at), shape, input.payloadG);
  const family = cheapestFamily(buildSkeleton(first).skeleton);

  if (typeof family === 'string') return { ok: false, reason: 'load', joint: family };

  const picks = picksOf(family);
  const template = armTemplate({ ...at, servos: Object.fromEntries(picks.map((p) => [p.joint, p.servo])) });
  const skeleton = armSkeleton(template, shape, input.payloadG);
  const reached = reachTargets(
    buildSkeleton(skeleton).skeleton,
    input.targets,
    seedsOf(
      solved,
      skeleton.joints.map((j) => j.id),
    ),
  );
  const arm: SizedArm = {
    base,
    heading,
    shape,
    shoulderMm: ARM_SHOULDER_MM,
    payloadG: input.payloadG,
    picks,
    rail: family.rail.name,
    volts: family.rail.volts,
    servosUsd: family.actuatorsUsd,
    costUsd: family.costUsd,
    template,
    skeleton,
    poses: reached.map((r) => r.values),
    errorsMm: reached.map((r) => Math.round(r.errorMm * 100) / 100),
  };

  return { ok: true, arm };
}

export function armTargets(input: ArmSizingInput) {
  const base = input.base ?? [0, 0, 0];
  const targets = input.targets.slice(0, MAX_TARGETS);
  const heading = headingFor(base, targets);
  const options = targets.map((t) => planeTargets(ARM_GEOMETRY, t, { at: base, heading }));

  return { base, targets, heading, options };
}

export function sizeArm(input: ArmSizingInput): ArmSizing {
  const { base, targets, heading, options } = armTargets(input);

  if (options.some((o) => !o.length || !o.some(maxRiserReach))) return farthest(base, targets);

  const shape = shortestShape(options);

  if (!shape) return farthest(base, targets);

  const sized = sizedArm({ base, heading, shape, options }, { ...input, targets });

  return sized.ok && sized.arm.errorsMm.some((e) => e > REACH_MM) ? farthest(base, targets) : sized;
}
