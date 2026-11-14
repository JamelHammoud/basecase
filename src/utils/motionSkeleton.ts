import * as THREE from 'three';
import { r1, r3, toCad } from '../agent/agentFrame';
import { buildSkeleton, linkLength, type SkeletonJointInput, type SkeletonPayload } from '../agent/skeleton';
import type { ZUpVec } from '../types/skeleton';
import { BASE_G, linkGrams, servoGrams } from './armSizing';
import { nameWords } from './jointNames';
import type { V3 } from './kinematicsRig';
import { autoMapBones, type Mocap } from './mocapBones';
import { boneTurns } from './motionAxes';
import { candidatesOf, fitLimb, peakRates, type JointRates, type LimbFit } from './motionFit';
import { motionServos, type MotionServos } from './motionServos';
import { limbPoints, limbsOf, namedKind, sampleClip, zeroPose, type Clip, type Limb } from './motionTree';
import { lengthLabel } from './size';

export interface MotionRequest {
  mocap: Mocap;
  heightMm: number;
  toleranceMm: number;
  limbs?: string[];
}

export interface FittedJoint extends JointRates {
  id: string;
  limb: string;
  spanDeg: [number, number];
}

export interface LimbPath {
  limb: string;
  errorMm: number;
}

export interface MotionFit {
  skeleton: SkeletonPayload;
  joints: FittedJoint[];
  paths: LimbPath[];
  servos: MotionServos | null;
  placement: { mmPerUnit: number; shift: V3 };
}

export type MotionSkeleton = { fit: MotionFit } | { problem: string; limb?: string };

export const TOLERANCE_SHARE = 0.01;

const MARGIN = 0.05;
const KINDS = ['pitch', 'roll', 'yaw'];

interface Frame {
  clip: Clip;
  pos: THREE.Vector3[];
  rot: THREE.Quaternion[];
  scale: number;
  shift: THREE.Vector3;
}

const world = (f: Frame, p: THREE.Vector3): V3 => p.clone().add(f.shift).toArray() as V3;

const effectorsAtRest = (f: Frame, limb: Limb) => limb.effectors.map((e) => world(f, f.pos[e]));

function limbTrack(f: Frame, limb: Limb) {
  const start = limb.nodes[0];
  const toWorld = (local: THREE.Vector3) =>
    world(f, local.applyQuaternion(f.rot[start]).multiplyScalar(f.scale).add(f.pos[start]));

  return {
    targets: f.clip.turns.map((_, i) => limbPoints(f.clip, limb, i).map(toWorld)),
    rest: effectorsAtRest(f, limb),
  };
}

function frameOf(clip: Clip, heightMm: number) {
  const turns = clip.bones.map((_, i) => boneTurns(clip.turns.map((frame) => frame[i])));
  const zero = zeroPose(
    clip.bones,
    turns.map((t) => t.mean),
  );
  const scale = heightMm / clip.extent;
  const pos = zero.pos.map((p) => p.clone().multiplyScalar(scale));
  const root = pos[clip.bones.findIndex((b) => b.parent < 0)];
  const shift = new THREE.Vector3(-root.x, -Math.min(...pos.map((p) => p.y)), -root.z);

  return { frame: { clip, pos, rot: zero.rot, scale, shift }, turns };
}

interface Placed {
  limb: Limb;
  fit: LimbFit;
}

const slug = (name: string) => nameWords(name).join('_') || 'joint';

function axisSign(axis: ZUpVec): { axis: ZUpVec; sign: number; kind: string } {
  const big = [0, 1, 2].reduce((m, k) => (Math.abs(axis[k]) > Math.abs(axis[m]) ? k : m), 0);
  const sign = axis[big] < 0 ? -1 : 1;

  return { axis: axis.map((v) => r3(v * sign) + 0) as ZUpVec, sign, kind: KINDS[big] };
}

function rangeOf(series: number[]): { range: [number, number]; span: [number, number] } {
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const pad = (hi - lo) * MARGIN;

  return {
    range: [Math.min(0, Math.floor((lo - pad) * 10) / 10), Math.max(0, Math.ceil((hi + pad) * 10) / 10)],
    span: [lo, hi],
  };
}

const centroid = (points: V3[]): ZUpVec =>
  toCad([0, 1, 2].map((k) => r1(points.reduce((s, p) => s + p[k], 0) / points.length)) as V3);

interface Assembly {
  names: Map<string, string>;
  joints: SkeletonJointInput[];
  fitted: FittedJoint[];
  lastOf: Map<number, string | undefined>;
  used: Set<string>;
}

function uniqueId(base: string, used: Set<string>): string {
  let n = 1;
  let id = base;

  while (used.has(id)) id = `${base}_${++n}`;

  used.add(id);

  return id;
}

function placeLimb(f: Frame, { limb, fit }: Placed, out: Assembly) {
  let parent = out.lastOf.get(limb.nodes[0]);

  fit.chosen.forEach((c, i) => {
    const { axis, sign, kind } = axisSign(toCad(c.axis));
    const bone = f.clip.bones[c.node].name;
    const id = uniqueId(`${slug(out.names.get(bone) ?? bone)}_${kind}`, out.used);
    const series = fit.values.map((v) => v[i] * sign);
    const { range, span } = rangeOf(series);

    out.joints.push({
      id,
      ...(parent ? { parent } : {}),
      origin: toCad(c.origin).map((v) => r1(v) + 0) as ZUpVec,
      axis,
      range,
      limb: namedKind([bone]) ?? limb.kind,
    });
    out.fitted.push({ id, limb: limb.name, spanDeg: span, ...peakRates(series, f.clip.dt) });
    parent = id;
  });

  out.lastOf.set(limb.nodes[limb.nodes.length - 1], parent);
}

function withTips(joints: SkeletonJointInput[], tips: Map<string, ZUpVec>): SkeletonJointInput[] {
  const parents = new Set(joints.map((j) => j.parent));

  return joints.map((j) => (parents.has(j.id) || !tips.has(j.id) ? j : { ...j, tip: tips.get(j.id) }));
}

function withMasses(payload: SkeletonPayload, actuators: Record<string, string> = {}): SkeletonPayload {
  const skeleton = buildSkeleton(payload).skeleton;
  const joints = payload.joints.map((j, i) => ({
    ...j,
    ...(actuators[j.id] ? { actuator: actuators[j.id] } : {}),
    link_mass_g: linkGrams(linkLength(skeleton, skeleton.joints[i])),
  }));
  const grams = joints.reduce((s, j) => s + j.link_mass_g + servoGrams(j.actuator), BASE_G);

  return { ...payload, joints, mass_g: Math.round(grams) };
}

const wanted = (limb: Limb, names?: string[]) =>
  !names?.length || names.some((n) => n.trim().toLowerCase() === limb.name.toLowerCase());

function fitLimbs(
  f: Frame,
  turns: ReturnType<typeof frameOf>['turns'],
  req: MotionRequest,
): { placed: Placed[] } | { limb: Limb } {
  const placed: Placed[] = [];

  for (const limb of limbsOf(f.clip.bones, f.clip.extent).filter((l) => wanted(l, req.limbs))) {
    const track = limbTrack(f, limb);
    const nodes = limb.joints.map((n) => ({ node: n, origin: world(f, f.pos[n]), frame: f.rot[n], turns: turns[n] }));
    const fit = fitLimb(candidatesOf(nodes, track.rest, req.toleranceMm), track, {
      toleranceMm: req.toleranceMm,
      nodes: limb.nodes,
    });

    if (!fit) return { limb };

    placed.push({ limb, fit });
  }

  return { placed };
}

export function fitMotion(req: MotionRequest): MotionSkeleton {
  const clip = sampleClip(req.mocap);

  if (clip.turns.length < 2 || clip.extent <= 0) return { problem: `Nothing moves in ${req.mocap.name}.` };

  const { frame, turns } = frameOf(clip, req.heightMm);
  const fitted = fitLimbs(frame, turns, req);

  if ('limb' in fitted)
    return {
      problem: `${fitted.limb.name} can't follow the clip within ${lengthLabel(req.toleranceMm)}.`,
      limb: fitted.limb.name,
    };

  const landmarks = Object.entries(autoMapBones(req.mocap)).map(([keypoint, bone]) => [bone!, keypoint] as const);
  const out: Assembly = { names: new Map(landmarks), joints: [], fitted: [], lastOf: new Map(), used: new Set() };
  const tips = new Map<string, ZUpVec>();

  for (const p of fitted.placed) {
    placeLimb(frame, p, out);

    const last = out.lastOf.get(p.limb.nodes[p.limb.nodes.length - 1]);

    if (last && p.fit.chosen.length) tips.set(last, centroid(effectorsAtRest(frame, p.limb)));
  }

  if (!out.joints.length) return { problem: `Nothing moves in ${req.mocap.name}.` };

  const plan = withMasses({ joints: withTips(out.joints, tips), replace: true });
  const servos = motionServos(buildSkeleton(plan).skeleton, new Map(out.fitted.map((j) => [j.id, j])));

  return {
    fit: {
      skeleton: servos ? withMasses(plan, servos.keys) : plan,
      joints: out.fitted,
      paths: fitted.placed.map((p) => ({ limb: p.limb.name, errorMm: p.fit.errorMm })),
      servos,
      placement: { mmPerUnit: frame.scale, shift: frame.shift.toArray() as V3 },
    },
  };
}
