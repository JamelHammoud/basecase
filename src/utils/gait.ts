import type { AnimationKeyframe, JointValues, RobotPoseState, RootOffset } from '../types/robotics';
import { goalParts, goalTargets, roundTo, type BuiltAnimation, type PointOf } from './animationGoals';
import { clampJoint, isMovable, preBend, solveIK, type IkTarget, type Rig, type V3 } from './kinematics';

export interface GaitSpec {
  feet: string[];
  phases?: number[];
  stride?: number;
  lift?: number;
  period?: number;
  duty?: number;
  crouch?: number;
  bob?: number;
  sway?: number;
  heading?: number;
  oscillators?: Array<{ joint: string; amplitude: number; phase?: number; offset?: number }>;
  samples?: number;
}

export function defaultPhases(n: number): number[] {
  if (n === 2) return [0, 0.5];

  if (n === 4) return [0, 0.5, 0.5, 0];

  return Array.from({ length: n }, (_, i) => i / n);
}

interface GaitFeet {
  feet: string[];
  points: V3[];
  feetParts: string[];
}

interface GaitPlan extends GaitFeet {
  rig: Rig;
  spec: GaitSpec;
  base: RobotPoseState;
  pointOf: PointOf;
  phases: number[];
  stride: number;
  lift: number;
  period: number;
  duty: number;
  crouch: number;
  bob: number;
  sway: number;
  fwd: V3;
  samples: number;
  free: string[];
  side0: number;
}

function gaitFeet(rig: Rig, spec: GaitSpec, pointOf: PointOf): GaitFeet | string {
  const feet = spec.feet.filter(Boolean);

  if (!feet.length) return 'Name the feet (part ids or ankle joint ids)';

  const points = feet.map((f) => pointOf(f, 'bottom'));
  const missing = feet.filter((_, i) => !points[i]);

  if (missing.length) return `Not on the canvas: ${missing.join(', ')}`;

  const feetParts = feet.map((f) => goalParts(rig, f).find((p) => rig.ownerOf.has(p)));
  const unmoved = feet.filter((_, i) => !feetParts[i]);

  if (unmoved.length) return `No joint moves ${unmoved.join(', ')}: declare the leg joints first`;

  return { feet, points: points as V3[], feetParts: feetParts as string[] };
}

function swingJoints(rig: Rig, feetParts: string[]): string[] {
  const legJoints = new Set<string>();
  const chainOf = (p: string) => rig.chain.get(rig.ownerOf.get(p)!);

  feetParts.forEach((p) => chainOf(p)?.forEach((j) => legJoints.add(j)));

  const shared = [...legJoints].filter((j) => feetParts.every((p) => chainOf(p)?.has(j)));

  shared.forEach((j) => legJoints.delete(j));

  return [...legJoints].filter((id) => isMovable(rig.byId.get(id)!));
}

function gaitShape(spec: GaitSpec, n: number, leg: number, spread: number) {
  const biped = n === 2;

  return {
    stride: spec.stride ?? leg * 0.35,
    lift: spec.lift ?? leg * 0.1,
    period: spec.period ?? Math.max(0.6, Math.sqrt(leg / 1000) * 1.1),
    duty: Math.min(Math.max(spec.duty ?? (biped ? 0.6 : 0.55), 0.3), 0.9),
    crouch: spec.crouch ?? leg * 0.05,
    bob: spec.bob ?? (biped ? leg * 0.015 : 0),
    sway: spec.sway ?? (biped ? spread * 0.12 : 0),
  };
}

interface GaitInput {
  rig: Rig;
  spec: GaitSpec;
  base: RobotPoseState;
  pointOf: PointOf;
}

function gaitPlan(input: GaitInput, found: GaitFeet): GaitPlan {
  const { rig, spec } = input;
  const { feet, points } = found;
  const hip = rig.rootPivot[1];
  const footY = Math.min(...points.map((p) => p[1]));
  const leg = Math.max(hip - footY, 40);
  const n = feet.length;
  const xs = points.map((p) => p[0]);
  const spread = Math.max(...xs) - Math.min(...xs);
  const heading = ((spec.heading ?? 0) * Math.PI) / 180;

  return {
    ...found,
    ...input,
    phases: spec.phases?.length === n ? spec.phases : defaultPhases(n),
    ...gaitShape(spec, n, leg, spread),
    fwd: [Math.sin(heading), 0, Math.cos(heading)],
    samples: Math.max(8, Math.min(spec.samples ?? 24, 60)),
    free: swingJoints(rig, found.feetParts),
    side0: Math.sign(points[0][0] - (Math.max(...xs) + Math.min(...xs)) / 2) || 1,
  };
}

const smoothStep = (u: number) => u * u * (3 - 2 * u);

function footOffset(plan: GaitPlan, p: number): { along: number; up: number } {
  if (p < plan.duty) return { along: plan.stride * (0.5 - p / plan.duty), up: 0 };

  const u = (p - plan.duty) / (1 - plan.duty);

  return { along: plan.stride * (-0.5 + smoothStep(u)), up: plan.lift * Math.sin(Math.PI * u) };
}

function gaitRoot(plan: GaitPlan, ph: number): RootOffset {
  return {
    position: [
      plan.sway * plan.side0 * Math.cos(2 * Math.PI * (ph - plan.duty / 2)),
      -plan.crouch - (plan.bob * (1 + Math.cos(4 * Math.PI * ph))) / 2,
      0,
    ],
  };
}

function gaitTargets(plan: GaitPlan, ph: number): IkTarget[] {
  const targets: IkTarget[] = [];

  plan.feet.forEach((f, i) => {
    const { along, up } = footOffset(plan, (((ph - plan.phases[i]) % 1) + 1) % 1);
    const pt = plan.points[i];
    const t = goalTargets(
      plan.rig,
      {
        part: f,
        target: [pt[0] + plan.fwd[0] * along, pt[1] + up, pt[2] + plan.fwd[2] * along],
        point: pt,
        keepOrientation: true,
      },
      plan.pointOf,
    );

    if (typeof t !== 'string') targets.push(...t);
  });

  return targets;
}

function gaitKeyframe(plan: GaitPlan, ph: number, values: JointValues, root: RootOffset): AnimationKeyframe {
  const v: JointValues = {};

  for (const id of plan.free) v[id] = values[id] ?? 0;

  for (const o of plan.spec.oscillators ?? []) {
    const j = plan.rig.byId.get(o.joint);

    if (!j) continue;

    v[o.joint] = clampJoint(
      j,
      (plan.base.values[o.joint] ?? 0) +
        (o.offset ?? 0) +
        o.amplitude * Math.sin(2 * Math.PI * ph + ((o.phase ?? 0) * Math.PI) / 180),
    );
  }

  return {
    t: roundTo(ph * plan.period, 4),
    values: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundTo(x, 2)])),
    root: { position: root.position!.map((x) => roundTo(x, 2)) as V3 },
  };
}

function runGait(plan: GaitPlan) {
  const ikError: Record<string, number> = {};
  const keyframes: AnimationKeyframe[] = [];
  let values: JointValues = preBend(plan.rig, plan.base.values, plan.free);

  for (let pass = 0; pass < 2; pass++) {
    for (let s = 0; s < plan.samples; s++) {
      const ph = s / plan.samples;
      const root = gaitRoot(plan, ph);
      const res = solveIK(plan.rig, values, gaitTargets(plan, ph), {
        joints: plan.free,
        root,
        prefer: values,
        preferWeight: 0.05,
        iterations: pass ? 30 : 60,
      });

      values = res.values;

      if (pass !== 1) continue;

      plan.feet.forEach((f, i) => (ikError[f] = Math.max(ikError[f] ?? 0, res.errors[i * 4] ?? 0)));
      keyframes.push(gaitKeyframe(plan, ph, values, root));
    }
  }

  return { ikError, keyframes };
}

function gaitNotes(plan: GaitPlan, ikError: Record<string, number>, keyframes: AnimationKeyframe[]): string[] {
  const notes: string[] = [];
  const unknown = (plan.spec.oscillators ?? []).filter((o) => !plan.rig.byId.has(o.joint)).map((o) => o.joint);

  if (unknown.length) notes.push(`No joints ${unknown.join(', ')}`);

  for (const [f, e] of Object.entries(ikError))
    if (e > 3)
      notes.push(`${f} misses its path by up to ${roundTo(e, 1)} mm: shorten the stride or lift, or add crouch`);

  const nearLimit = (v: number, limit: number) => Math.abs(v - limit) < 0.05;
  const atLimit = plan.free.filter((id) => {
    const j = plan.rig.byId.get(id)!;

    return (
      j.range && keyframes.some((k) => nearLimit(k.values[id], j.range![0]) || nearLimit(k.values[id], j.range![1]))
    );
  });

  if (atLimit.length) notes.push(`At a joint limit during the cycle: ${atLimit.join(', ')}`);

  return notes;
}

export function buildGait(
  rig: Rig,
  spec: GaitSpec,
  base: RobotPoseState,
  { pointOf, name }: { pointOf: PointOf; name: string },
): BuiltAnimation | string {
  const found = gaitFeet(rig, spec, pointOf);

  if (typeof found === 'string') return found;

  const plan = gaitPlan({ rig, spec, base, pointOf }, found);
  const { ikError, keyframes } = runGait(plan);
  const notes = gaitNotes(plan, ikError, keyframes);

  return {
    animation: {
      id: '',
      name,
      duration: roundTo(plan.period, 4),
      loop: true,
      keyframes,
      interpolation: 'smooth',
      source: 'gait',
    },
    notes,
    ikError,
  };
}
