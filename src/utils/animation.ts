import * as THREE from 'three';
import type {
  AnimationKeyframe,
  JointValues,
  RobotAnimation,
  RobotJoint,
  RobotPoseState,
  RootOffset,
} from '../types/robotics';
import { goalTargets, roundTo, type IkGoal, type PointOf } from './animationGoals';
import { clampJoint, isMovable, preBend, solveIK, type IkTarget, type Rig, type V3 } from './kinematics';

export { goalParts, goalTargets, type BuiltAnimation, type IkGoal, type PointOf } from './animationGoals';
export { buildGait, defaultPhases, type GaitSpec } from './gait';

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const catmullRom = ([p0, p1, p2, p3]: number[], u: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
const blend = (v: number[], u: number, smooth: boolean) => (smooth ? catmullRom(v, u) : lerp(v[1], v[2], u));

const D2R = Math.PI / 180;
const quatOf = (r?: V3) =>
  new THREE.Quaternion().setFromEuler(
    new THREE.Euler((r?.[0] ?? 0) * D2R, (r?.[1] ?? 0) * D2R, (r?.[2] ?? 0) * D2R, 'XYZ'),
  );

function blendRoot(ks: Array<RootOffset | undefined>, u: number, smooth: boolean): RootOffset | undefined {
  if (ks.every((k) => !k)) return undefined;

  const position = [0, 1, 2].map((i) =>
    blend(
      ks.map((k) => k?.position?.[i] ?? 0),
      u,
      smooth,
    ),
  ) as V3;
  const q = quatOf(ks[1]?.rotation).slerp(quatOf(ks[2]?.rotation), u);
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');

  return { position, rotation: [e.x / D2R, e.y / D2R, e.z / D2R] };
}

interface Span {
  i: number;
  a: AnimationKeyframe;
  b: AnimationKeyframe;
  span: number;
  time: number;
  wraps: boolean;
}

function spanAt(anim: RobotAnimation, t: number): Span {
  const ks = anim.keyframes;
  const last = ks[ks.length - 1];
  const d = Math.max(anim.duration, last.t, 1e-3);
  const time = anim.loop ? ((t % d) + d) % d : Math.min(Math.max(t, 0), d);
  const wraps = anim.loop && (time >= last.t || time < ks[0].t);

  if (wraps)
    return {
      i: ks.length - 1,
      a: last,
      b: ks[0],
      span: d - last.t + ks[0].t,
      time: time < last.t ? time + d : time,
      wraps,
    };

  let i = ks.findIndex((k, idx) => idx < ks.length - 1 && time >= k.t && time < ks[idx + 1].t);

  if (i < 0) i = time < ks[0].t ? 0 : ks.length - 2;

  return { i, a: ks[i], b: ks[i + 1], span: ks[i + 1].t - ks[i].t, time, wraps };
}

export function sampleAnimation(anim: RobotAnimation, t: number): RobotPoseState {
  const ks = anim.keyframes;

  if (!ks.length) return { values: {} };

  if (ks.length === 1) return { values: { ...ks[0].values }, root: ks[0].root };

  const { i, a, b, span, time, wraps } = spanAt(anim, t);
  const u = span > 0 ? Math.min(Math.max((time - a.t) / span, 0), 1) : 0;
  const n = ks.length;
  const at = (k: number) => (anim.loop ? ks[((k % n) + n) % n] : ks[Math.min(Math.max(k, 0), n - 1)]);
  const smooth = anim.interpolation === 'smooth';
  const around = [at(i - 1), a, b, at(wraps ? 1 : i + 2)];
  const values: JointValues = {};

  for (const id of Object.keys(a.values)) {
    values[id] = blend(
      around.map((k) => k.values[id] ?? a.values[id]),
      u,
      smooth,
    );
  }

  return {
    values,
    root: blendRoot(
      around.map((k) => k.root),
      u,
      smooth,
    ),
  };
}

export interface KeyframeSpec {
  t: number;
  values?: JointValues;
  root?: RootOffset;
  ik?: IkGoal[];
}

interface KeyframeRun {
  rig: Rig;
  pointOf: PointOf;
  notes: string[];
  ikError: Record<string, number>;
  animated: Set<string>;
}

function setKeyframeValues(run: KeyframeRun, k: KeyframeSpec, values: JointValues) {
  for (const [id, v] of Object.entries(k.values ?? {})) {
    const j = run.rig.byId.get(id);

    if (!j) {
      run.notes.push(`No joint ${id}`);

      continue;
    }

    const c = clampJoint(j, v);

    if (Math.abs(c - v) > 0.01) run.notes.push(`${id} at ${k.t}s: ${v} is past its range, held at ${roundTo(c)}`);

    values[id] = c;
    run.animated.add(id);
  }
}

function goalTargetList(run: KeyframeRun, goals: IkGoal[]): IkTarget[] {
  const targets: IkTarget[] = [];

  for (const g of goals) {
    const t = goalTargets(run.rig, g, run.pointOf);

    if (typeof t === 'string') run.notes.push(t);
    else targets.push(...t);
  }

  return targets;
}

function solveKeyframeGoals(run: KeyframeRun, k: KeyframeSpec, goals: IkGoal[], values: JointValues) {
  const targets = goalTargetList(run, goals);
  const fixed = new Set(Object.keys(k.values ?? {}));
  const free = run.rig.joints.filter((j) => isMovable(j) && !fixed.has(j.id)).map((j) => j.id);
  const res = solveIK(run.rig, preBend(run.rig, values, free), targets, {
    joints: free,
    root: k.root,
    prefer: values,
    iterations: 60,
  });

  for (const [id, v] of Object.entries(res.values)) {
    if (Math.abs(v - (values[id] ?? 0)) > 1e-4) run.animated.add(id);

    values[id] = v;
  }

  let ti = 0;

  for (const g of goals) {
    const e = res.errors[ti] ?? 0;

    run.ikError[g.part] = Math.max(run.ikError[g.part] ?? 0, e);
    ti += g.keepOrientation ? 4 : 1;
  }
}

export function buildKeyframes(
  rig: Rig,
  specs: KeyframeSpec[],
  base: RobotPoseState,
  pointOf: PointOf,
): { keyframes: AnimationKeyframe[]; notes: string[]; ikError: Record<string, number> } {
  const run: KeyframeRun = { rig, pointOf, notes: [], ikError: {}, animated: new Set() };
  const sorted = [...specs].sort((a, b) => a.t - b.t);
  let prev: JointValues = { ...base.values };
  const out: AnimationKeyframe[] = [];

  for (const k of sorted) {
    const values: JointValues = { ...prev };

    setKeyframeValues(run, k, values);

    if (k.ik?.length) solveKeyframeGoals(run, k, k.ik, values);

    out.push({ t: k.t, values, root: k.root });
    prev = values;
  }

  for (const k of out) {
    k.values = Object.fromEntries([...run.animated].map((id) => [id, roundTo(k.values[id] ?? 0, 2)]));
  }

  for (const [part, e] of Object.entries(run.ikError))
    if (e > 3)
      run.notes.push(`${part} misses its target by up to ${roundTo(e, 1)} mm (out of reach or past a joint limit)`);

  return { keyframes: out, notes: run.notes, ikError: run.ikError };
}

export function animatedJoints(anim: RobotAnimation, joints: RobotJoint[]): RobotJoint[] {
  const ids = new Set(anim.keyframes.flatMap((k) => Object.keys(k.values)));

  return joints.filter((j) => ids.has(j.id));
}
