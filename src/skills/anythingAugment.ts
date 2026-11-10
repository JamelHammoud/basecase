import type { SimModel } from '../sim/mjcfTypes';
import { offsetPose } from './kitModel';
import type { BodyFacts } from './anythingBody';
import type { Statics, JointValues } from './anythingStatics';
import type { IntentKey, TaskSpec } from './anythingTypes';

export interface Key {
  t: number;
  values: JointValues;
  free?: boolean;
}

export interface Leap {
  crouch: number;
  leadS: number;
}

export const LEAPS: readonly Leap[] = Object.freeze([
  { crouch: 0.2, leadS: 0.35 },
  { crouch: 0.35, leadS: 0.25 },
]);

const RAMP_SHARES = [0.35, 0.7];
const MAX_RAMP_S = 2;

const mix = (a: JointValues, b: JointValues, k: number): JointValues =>
  Object.fromEntries(Object.keys(a).map((id) => [id, a[id] * (1 - k) + (b[id] ?? a[id]) * k]));

function startValues(model: SimModel, facts: BodyFacts, degrees: number): JointValues {
  const pose = offsetPose(model, degrees);

  return Object.fromEntries(
    facts.joints.map((j) => {
      const v = pose.values[j.id] ?? j.restDeg;
      const [lo, hi] = j.range ?? [-Infinity, Infinity];

      return [j.id, Math.max(lo, Math.min(hi, v))];
    }),
  );
}

function fromOffset(keys: Key[], options: { model: SimModel; facts: BodyFacts; spec: TaskSpec }): Key[] {
  const { model, facts, spec } = options;

  if (!spec.startOffsetDeg || !keys.length) return keys;

  const start = startValues(model, facts, spec.startOffsetDeg);
  const next = keys.find((k) => k.t > 0) ?? keys[0];
  const span = Math.min(next.t > 0 ? next.t : MAX_RAMP_S, MAX_RAMP_S);
  const ramp = RAMP_SHARES.map((share) => ({ t: span * share, values: mix(start, next.values, share), free: true }));

  return [{ t: 0, values: start }, ...ramp, ...keys.filter((k) => k.t >= span)];
}

export const leapsIn = (intent: IntentKey[]) => intent.some((k) => (k.base?.up ?? 0) > 0);

function beforeLeaps(
  keys: Key[],
  options: { intent: IntentKey[]; statics: Statics; facts: BodyFacts; leap: Leap },
): Key[] {
  const { intent, statics, facts, leap } = options;
  const crouch = statics.solve({ base: { up: -leap.crouch * facts.heightM } }, facts.rest).values;

  return keys.flatMap((k, i) => {
    const leaps = (intent[i]?.base?.up ?? 0) > 0 && k.t > leap.leadS;

    if (!leaps) return [k];

    return [
      { t: k.t - leap.leadS, values: crouch, free: true },
      { ...k, free: true },
    ];
  });
}

export function augmented(
  keys: Key[],
  options: { model: SimModel; facts: BodyFacts; spec: TaskSpec; statics: Statics; leap: Leap },
): Key[] {
  const { facts, spec, statics, leap } = options;
  const leaps = facts.floating ? beforeLeaps(keys, { intent: spec.intent, statics, facts, leap }) : keys;

  return fromOffset(leaps, options).sort((a, b) => a.t - b.t);
}
