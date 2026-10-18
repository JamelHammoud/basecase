import * as THREE from 'three';
import type { AnimationKeyframe, JointValues, RobotAnimation, RobotJoint, RobotPoseState, RootOffset } from '../types/robotics';
import { clampJoint, isMovable, linkParts, preBend, solveIK, type IkTarget, type Rig, type V3 } from './kinematics';

/* ------------------------------------------------------------------ */
/* Playback                                                            */
/* ------------------------------------------------------------------ */

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** Catmull-Rom through p1 → p2 */
const cr = (p0: number, p1: number, p2: number, p3: number, u: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);

const D2R = Math.PI / 180;
const quatOf = (r?: V3) => new THREE.Quaternion().setFromEuler(new THREE.Euler((r?.[0] ?? 0) * D2R, (r?.[1] ?? 0) * D2R, (r?.[2] ?? 0) * D2R, 'XYZ'));

function blendRoot(ks: Array<RootOffset | undefined>, u: number, smooth: boolean): RootOffset | undefined {
  if (ks.every((k) => !k)) return undefined;
  const position = [0, 1, 2].map((i) => {
    const v = ks.map((k) => k?.position?.[i] ?? 0);
    return smooth ? cr(v[0], v[1], v[2], v[3], u) : lerp(v[1], v[2], u);
  }) as V3;
  // Turns blend as rotations (Euler angles jump between equivalent forms)
  const q = quatOf(ks[1]?.rotation).slerp(quatOf(ks[2]?.rotation), u);
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return { position, rotation: [e.x / D2R, e.y / D2R, e.z / D2R] };
}

/** The pose at time t (seconds) */
export function sampleAnimation(anim: RobotAnimation, t: number): RobotPoseState {
  const ks = anim.keyframes;
  if (!ks.length) return { values: {} };
  if (ks.length === 1) return { values: { ...ks[0].values }, root: ks[0].root };
  const d = Math.max(anim.duration, ks[ks.length - 1].t, 1e-3);
  let time = anim.loop ? ((t % d) + d) % d : Math.min(Math.max(t, 0), d);
  // Find the segment; a loop wraps from the last keyframe back to the first
  let i = ks.findIndex((k, idx) => idx < ks.length - 1 && time >= k.t && time < ks[idx + 1].t);
  let a: AnimationKeyframe, b: AnimationKeyframe, span: number;
  const wraps = anim.loop && (time >= ks[ks.length - 1].t || time < ks[0].t);
  if (wraps) {
    i = ks.length - 1;
    a = ks[i];
    b = ks[0];
    span = d - a.t + b.t;
    if (time < a.t) time += d;
  } else {
    if (i < 0) i = time < ks[0].t ? 0 : ks.length - 2;
    a = ks[i];
    b = ks[i + 1];
    span = b.t - a.t;
  }
  const u = span > 0 ? Math.min(Math.max((time - a.t) / span, 0), 1) : 0;
  const at = (k: number) => {
    const n = ks.length;
    if (anim.loop) return ks[((k % n) + n) % n];
    return ks[Math.min(Math.max(k, 0), n - 1)];
  };
  const smooth = anim.interpolation === 'smooth';
  const k0 = at(i - 1), k1 = a, k2 = b, k3 = at(wraps ? 1 : i + 2);
  const values: JointValues = {};
  for (const id of Object.keys(a.values)) {
    const v = [k0, k1, k2, k3].map((k) => k.values[id] ?? a.values[id]);
    values[id] = smooth ? cr(v[0], v[1], v[2], v[3], u) : lerp(v[1], v[2], u);
  }
  return { values, root: blendRoot([k0.root, k1.root, k2.root, k3.root], u, smooth) };
}

/* ------------------------------------------------------------------ */
/* Authoring: keyframes from values and IK targets                     */
/* ------------------------------------------------------------------ */

/** A point on a part (or a joint's link) in the rest pose */
export type PointOf = (id: string, where: 'bottom' | 'center') => V3 | null;

export interface IkGoal {
  /** Part id, or a joint id (its link) */
  part: string;
  target: V3;
  /** Point on the part, rest pose; defaults to `where` on its bounds */
  point?: V3;
  /** bottom = the sole of a foot; center (default) for hands and heads */
  where?: 'bottom' | 'center';
  /** Also keep the part's rest orientation (feet flat on the floor) */
  keepOrientation?: boolean;
}

export interface KeyframeSpec {
  t: number;
  values?: JointValues;
  root?: RootOffset;
  ik?: IkGoal[];
}

/** Parts for a goal: the part itself, or every part a joint moves directly */
export function goalParts(rig: Rig, id: string): string[] {
  if (rig.byId.has(id)) return linkParts(rig, id);
  return [id];
}

/** IK targets for one goal: one point, or three to hold the orientation too */
export function goalTargets(rig: Rig, goal: IkGoal, pointOf: PointOf, offset?: V3): IkTarget[] | string {
  const parts = goalParts(rig, goal.part);
  const partId = parts.find((p) => rig.ownerOf.has(p)) ?? parts[0];
  if (!partId) return `${goal.part}: no parts move with it`;
  if (!rig.ownerOf.has(partId)) return `${goal.part}: no joint moves it`;
  const point = goal.point ?? pointOf(goal.part, goal.where ?? 'center');
  if (!point) return `${goal.part}: not on the canvas`;
  const off = offset ?? [0, 0, 0];
  const out: IkTarget[] = [{ partId, point, target: [goal.target[0] + off[0], goal.target[1] + off[1], goal.target[2] + off[2]], weight: 1 }];
  if (goal.keepOrientation) {
    // Two more points 40 mm forward and sideways, moved by the same offset: holds the rest orientation
    const shift = [goal.target[0] - point[0] + off[0], goal.target[1] - point[1] + off[1], goal.target[2] - point[2] + off[2]];
    for (const d of [[0, 0, 40], [40, 0, 0], [0, 40, 0]] as V3[]) {
      const p: V3 = [point[0] + d[0], point[1] + d[1], point[2] + d[2]];
      out.push({ partId, point: p, target: [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]], weight: 0.35 });
    }
  }
  return out;
}

export interface BuiltAnimation {
  animation: RobotAnimation;
  /** Problems worth telling the author about */
  notes: string[];
  /** Worst IK miss per goal part (mm) */
  ikError: Record<string, number>;
}

/** Keyframes from explicit values and IK goals; every keyframe ends up listing every animated joint */
export function buildKeyframes(rig: Rig, specs: KeyframeSpec[], base: RobotPoseState, pointOf: PointOf): { keyframes: AnimationKeyframe[]; notes: string[]; ikError: Record<string, number> } {
  const notes: string[] = [];
  const ikError: Record<string, number> = {};
  const sorted = [...specs].sort((a, b) => a.t - b.t);
  const animated = new Set<string>();
  let prev: JointValues = { ...base.values };
  const out: AnimationKeyframe[] = [];
  for (const k of sorted) {
    const values: JointValues = { ...prev };
    for (const [id, v] of Object.entries(k.values ?? {})) {
      const j = rig.byId.get(id);
      if (!j) {
        notes.push(`No joint ${id}`);
        continue;
      }
      const c = clampJoint(j, v);
      if (Math.abs(c - v) > 0.01) notes.push(`${id} at ${k.t}s: ${v} is past its range, held at ${round(c)}`);
      values[id] = c;
      animated.add(id);
    }
    if (k.ik?.length) {
      const targets: IkTarget[] = [];
      for (const g of k.ik) {
        const t = goalTargets(rig, g, pointOf);
        if (typeof t === 'string') notes.push(t);
        else targets.push(...t);
      }
      const fixed = new Set(Object.keys(k.values ?? {}));
      const free = rig.joints.filter((j) => isMovable(j) && !fixed.has(j.id)).map((j) => j.id);
      const res = solveIK(rig, preBend(rig, values, free), targets, { joints: free, root: k.root, prefer: values, iterations: 60 });
      for (const [id, v] of Object.entries(res.values)) {
        if (Math.abs(v - (values[id] ?? 0)) > 1e-4) animated.add(id);
        values[id] = v;
      }
      let ti = 0;
      for (const g of k.ik) {
        const n = g.keepOrientation ? 4 : 1;
        const e = res.errors[ti] ?? 0;
        ikError[g.part] = Math.max(ikError[g.part] ?? 0, e);
        ti += n;
      }
    }
    out.push({ t: k.t, values, root: k.root });
    prev = values;
  }
  for (const k of out) {
    k.values = Object.fromEntries([...animated].map((id) => [id, round(k.values[id] ?? 0, 2)]));
  }
  for (const [part, e] of Object.entries(ikError)) if (e > 3) notes.push(`${part} misses its target by up to ${round(e, 1)} mm (out of reach or past a joint limit)`);
  return { keyframes: out, notes, ikError };
}

/* ------------------------------------------------------------------ */
/* Gaits: walk cycles for any number of feet                           */
/* ------------------------------------------------------------------ */

export interface GaitSpec {
  /** Foot parts or ankle joints, in phase order */
  feet: string[];
  /** Phase of each foot in the cycle (0–1); biped 0, 0.5; quadruped trot 0, 0.5, 0.5, 0 */
  phases?: number[];
  /** Step length (mm), lift height (mm), cycle time (s) */
  stride?: number;
  lift?: number;
  period?: number;
  /** Share of the cycle each foot is on the ground */
  duty?: number;
  /** Lower the body (mm) so the knees bend */
  crouch?: number;
  /** Up-down body motion (mm) and side-to-side weight shift (mm) */
  bob?: number;
  sway?: number;
  /** Degrees; 0 walks toward the robot's front */
  heading?: number;
  /** Extra joint motion on top: arm swing, head nod, tail wag */
  oscillators?: Array<{ joint: string; amplitude: number; phase?: number; offset?: number }>;
  samples?: number;
}

export function buildGait(rig: Rig, spec: GaitSpec, base: RobotPoseState, pointOf: PointOf, name: string): BuiltAnimation | string {
  const feet = spec.feet.filter(Boolean);
  if (!feet.length) return 'Name the feet (part ids or ankle joint ids)';
  const points = feet.map((f) => pointOf(f, 'bottom'));
  const missing = feet.filter((_, i) => !points[i]);
  if (missing.length) return `Not on the canvas: ${missing.join(', ')}`;
  const feetParts = feet.map((f) => goalParts(rig, f).find((p) => rig.ownerOf.has(p)));
  const unmoved = feet.filter((_, i) => !feetParts[i]);
  if (unmoved.length) return `No joint moves ${unmoved.join(', ')}: declare the leg joints first`;

  const hip = rig.rootPivot[1];
  const footY = Math.min(...points.map((p) => p![1]));
  const leg = Math.max(hip - footY, 40);
  const n = feet.length;
  const phases = spec.phases?.length === n ? spec.phases : n === 2 ? [0, 0.5] : n === 4 ? [0, 0.5, 0.5, 0] : feet.map((_, i) => i / n);
  const stride = spec.stride ?? leg * 0.35;
  const lift = spec.lift ?? leg * 0.1;
  const period = spec.period ?? Math.max(0.6, Math.sqrt(leg / 1000) * 1.1);
  const duty = Math.min(Math.max(spec.duty ?? (n === 2 ? 0.6 : 0.55), 0.3), 0.9);
  const crouch = spec.crouch ?? leg * 0.05;
  const bob = spec.bob ?? (n === 2 ? leg * 0.015 : 0);
  const xs = points.map((p) => p![0]);
  const spread = Math.max(...xs) - Math.min(...xs);
  const sway = spec.sway ?? (n === 2 ? spread * 0.12 : 0);
  const heading = ((spec.heading ?? 0) * Math.PI) / 180;
  // Forward is +Z in the scene (the robot's front faces −Y in the agent frame)
  const fwd: V3 = [Math.sin(heading), 0, Math.cos(heading)];
  const samples = Math.max(8, Math.min(spec.samples ?? 24, 60));
  const legJoints = new Set<string>();
  feetParts.forEach((p) => rig.chain.get(rig.ownerOf.get(p!)!)?.forEach((j) => legJoints.add(j)));
  // Joints above the hips stay put
  const shared = [...legJoints].filter((j) => feetParts.every((p) => rig.chain.get(rig.ownerOf.get(p!)!)?.has(j)));
  shared.forEach((j) => legJoints.delete(j));
  const free = [...legJoints].filter((id) => isMovable(rig.byId.get(id)!));

  const smooth = (u: number) => u * u * (3 - 2 * u);
  const side0 = Math.sign(points[0]![0] - (Math.max(...xs) + Math.min(...xs)) / 2) || 1;
  const notes: string[] = [];
  const ikError: Record<string, number> = {};
  let values: JointValues = preBend(rig, base.values, free);
  const keyframes: AnimationKeyframe[] = [];
  // Two passes: the second starts from the end of the first, so the loop closes cleanly
  for (let pass = 0; pass < 2; pass++) {
    for (let s = 0; s < samples; s++) {
      const ph = s / samples;
      const root: RootOffset = {
        position: [
          sway * side0 * Math.cos(2 * Math.PI * (ph - duty / 2)),
          -crouch - (bob * (1 + Math.cos(4 * Math.PI * ph))) / 2,
          0,
        ],
      };
      const targets: IkTarget[] = [];
      feet.forEach((f, i) => {
        const p = ((ph - phases[i]) % 1 + 1) % 1;
        let along: number, up: number;
        if (p < duty) {
          along = stride * (0.5 - p / duty);
          up = 0;
        } else {
          const u = (p - duty) / (1 - duty);
          along = stride * (-0.5 + smooth(u));
          up = lift * Math.sin(Math.PI * u);
        }
        const pt = points[i]!;
        const t = goalTargets(rig, { part: f, target: [pt[0] + fwd[0] * along, pt[1] + up, pt[2] + fwd[2] * along], point: pt, keepOrientation: true }, pointOf);
        if (typeof t !== 'string') targets.push(...t);
      });
      const res = solveIK(rig, values, targets, { joints: free, root, prefer: values, preferWeight: 0.05, iterations: pass ? 30 : 60 });
      values = res.values;
      if (pass === 1) {
        feet.forEach((f, i) => (ikError[f] = Math.max(ikError[f] ?? 0, res.errors[i * 4] ?? 0)));
        const v: JointValues = {};
        for (const id of free) v[id] = values[id] ?? 0;
        for (const o of spec.oscillators ?? []) {
          const j = rig.byId.get(o.joint);
          if (!j) continue;
          v[o.joint] = clampJoint(j, (base.values[o.joint] ?? 0) + (o.offset ?? 0) + o.amplitude * Math.sin(2 * Math.PI * ph + ((o.phase ?? 0) * Math.PI) / 180));
        }
        keyframes.push({ t: round(ph * period, 4), values: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x, 2)])), root: { position: root.position!.map((x) => round(x, 2)) as V3 } });
      }
    }
  }
  const unknown = (spec.oscillators ?? []).filter((o) => !rig.byId.has(o.joint)).map((o) => o.joint);
  if (unknown.length) notes.push(`No joints ${unknown.join(', ')}`);
  for (const [f, e] of Object.entries(ikError)) if (e > 3) notes.push(`${f} misses its path by up to ${round(e, 1)} mm: shorten the stride or lift, or add crouch`);
  const atLimit = free.filter((id) => {
    const j = rig.byId.get(id)!;
    return j.range && keyframes.some((k) => Math.abs(k.values[id] - j.range![0]) < 0.05 || Math.abs(k.values[id] - j.range![1]) < 0.05);
  });
  if (atLimit.length) notes.push(`At a joint limit during the cycle: ${atLimit.join(', ')}`);
  return {
    animation: {
      id: '',
      name,
      duration: round(period, 4),
      loop: true,
      keyframes,
      interpolation: 'smooth',
      source: 'gait',
    },
    notes,
    ikError,
  };
}

/** Joints an animation moves */
export function animatedJoints(anim: RobotAnimation, joints: RobotJoint[]): RobotJoint[] {
  const ids = new Set(anim.keyframes.flatMap((k) => Object.keys(k.values)));
  return joints.filter((j) => ids.has(j.id));
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
