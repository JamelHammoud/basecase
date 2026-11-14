import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import { IDLE_S, pausesOf, runsOf, speeds } from './segmentFrames';

export const FLAG_KINDS = ['limit', 'gap', 'effort', 'idle', 'model'] as const;

export type FlagKind = (typeof FLAG_KINDS)[number];

export interface TryFlag {
  kind: FlagKind;
  at: number;
  joint?: string;
}

export interface FlagScene {
  model: SimModel;
  bodies: number[];
  skipJoints: string[];
}

const LIMIT_SHARE = 0.01;
const SATURATED = 0.999;
const GAP_FACTOR = 1.5;
const MAX_PER_KIND = 20;

const toSi = (type: SimModel['joints'][number]['type'], v: number) =>
  type === 'prismatic' ? v / 1000 : (v * Math.PI) / 180;

function limitFlags(r: Recording, scene: FlagScene): TryFlag[] {
  return scene.model.joints.flatMap((j, i) => {
    const address = r.jointQpos?.[i];

    if (!j.range || address === undefined || address < 0 || scene.skipJoints.includes(j.id)) return [];

    const [lo, hi] = [Math.min(...j.range), Math.max(...j.range)].map((v) => toSi(j.type, v));
    const near = (hi - lo) * LIMIT_SHARE;
    const at = Array.from({ length: r.frames }, (_, f) => {
      const q = r.qpos[f * r.nq + address];

      return q <= lo + near || q >= hi - near;
    });

    return runsOf(at, 1)
      .filter((run) => run.start > 0)
      .map((run) => ({ kind: 'limit' as const, at: run.start * r.dt, joint: j.id }));
  });
}

function gapFlags(r: Recording): TryFlag[] {
  const gaps = Array.from(
    { length: r.frames },
    (_, f) => (f > 0 && r.t[f] - r.t[f - 1] > r.dt * GAP_FACTOR) || !Number.isFinite(r.poses[f * r.nbody * 7]),
  );

  return runsOf(gaps, 1).map((run) => ({ kind: 'gap' as const, at: run.start * r.dt }));
}

function effortFlags(r: Recording): TryFlag[] {
  const torque = r.torque;

  if (!torque) return [];

  return runsOf(
    Array.from(torque, (v) => v >= SATURATED),
    1,
  ).map((run) => ({ kind: 'effort' as const, at: run.start * r.dt }));
}

const idleFlags = (r: Recording, scene: FlagScene): TryFlag[] =>
  pausesOf(r, speeds(r, scene.bodies), IDLE_S).map((run) => ({ kind: 'idle' as const, at: run.start * r.dt }));

export function tryFlags(r: Recording, scene: FlagScene): TryFlag[] {
  if (r.frames < 1) return [];

  return [limitFlags(r, scene), gapFlags(r), effortFlags(r), idleFlags(r, scene)].flatMap((list) =>
    list.slice(0, MAX_PER_KIND),
  );
}

export const flagKinds = (flags: TryFlag[] | undefined) => [...new Set((flags ?? []).map((f) => f.kind))];

export function readFlags(value: unknown): TryFlag[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value.flatMap((v) => {
    const f = v as Partial<TryFlag>;

    if (!FLAG_KINDS.includes(f.kind as FlagKind) || typeof f.at !== 'number' || !Number.isFinite(f.at)) return [];

    return [
      { kind: f.kind as FlagKind, at: f.at, ...(typeof f.joint === 'string' ? { joint: f.joint.slice(0, 128) } : {}) },
    ];
  });
}
