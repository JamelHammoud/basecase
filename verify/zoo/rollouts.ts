import type { MainModule } from '@mujoco/mujoco';
import { signalReaders } from '../../src/skills/arenaSignals';
import { evaluateContract, type Contract, type Trace } from '../../src/skills/contract';
import type { SignalSource } from '../../src/skills/environment';
import { offsetPose } from '../skills/judge';
import type { Pose, Poser } from './bodies';
import type { Rng } from './rng';
import type { Keyframe, TaskDraw } from './taskTypes';

export const ROLLOUT_DT = 0.02;

const NUMERIC = ['forward', 'right', 'up', 'tilt'] as const;

function blend(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};

  for (const field of NUMERIC) out[field] = (a[field] ?? 0) * (1 - k) + (b[field] ?? 0) * k;

  const ids = new Set([...Object.keys(a.joints ?? {}), ...Object.keys(b.joints ?? {})]);

  out.joints = Object.fromEntries(
    [...ids].map((id) => [id, (a.joints?.[id] ?? 0) * (1 - k) + (b.joints?.[id] ?? 0) * k]),
  );

  return out;
}

export function poseAt(keys: Keyframe[], t: number): Pose {
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const next = sorted.findIndex((k) => k.t >= t);

  if (next <= 0) return sorted[next === 0 ? 0 : sorted.length - 1].pose;

  const a = sorted[next - 1];
  const b = sorted[next];

  return blend(a.pose, b.pose, (t - a.t) / Math.max(b.t - a.t, 1e-9));
}

export function framesOf(poser: Poser, keys: Keyframe[], horizonS: number): Float64Array[] {
  const ticks = Math.floor(horizonS / ROLLOUT_DT + 1e-9) + 1;

  return Array.from({ length: ticks }, (_, i) => poser.qpos(poseAt(keys, i * ROLLOUT_DT)));
}

const scaledPose = (p: Pose, s: number): Pose => ({
  ...Object.fromEntries(NUMERIC.map((f) => [f, (p[f] ?? 0) * s])),
  joints: Object.fromEntries(Object.entries(p.joints ?? {}).map(([id, v]) => [id, v * s])),
});

const mapPoses = (keys: Keyframe[], f: (p: Pose, t: number) => Pose) =>
  keys.map((k) => ({ t: k.t, pose: f(k.pose, k.t) }));

export interface Variant {
  name: string;
  keys: Keyframe[];
}

export function variantsOf(draw: TaskDraw, rng: Rng, heightM: number): Variant[] {
  const { intent, horizonS: h } = draw;
  const mid = h / 2;
  const jitter = () => 1 + (rng() - 0.5) * 0.1;

  return [
    { name: 'intent', keys: intent },
    {
      name: 'rest',
      keys: [
        { t: 0, pose: {} },
        { t: h, pose: {} },
      ],
    },
    { name: 'half', keys: mapPoses(intent, (p) => scaledPose(p, 0.5)) },
    { name: 'over', keys: mapPoses(intent, (p) => scaledPose(p, 1.4)) },
    { name: 'mirrored', keys: mapPoses(intent, (p) => scaledPose(p, -1)) },
    { name: 'late', keys: intent.map((k) => ({ t: Math.min(k.t * 1.6, h), pose: k.pose })) },
    { name: 'noisy', keys: mapPoses(intent, (p) => scaledPose(p, jitter())) },
    { name: 'quit', keys: [...intent.filter((k) => k.t < mid), { t: mid + 0.5, pose: {} }, { t: h, pose: {} }] },
    { name: 'topple', keys: mapPoses(intent, (p, t) => (t >= mid ? { ...p, tilt: 1.3, up: -0.5 * heightM } : p)) },
    { name: 'sag', keys: mapPoses(intent, (p, t) => (t >= mid ? { ...p, up: (p.up ?? 0) - 0.3 * heightM } : p)) },
    {
      name: 'drift',
      keys: mapPoses(intent, (p, t) =>
        t >= mid ? { ...p, forward: (p.forward ?? 0) + 0.2, right: (p.right ?? 0) + 0.2 } : p,
      ),
    },
  ];
}

export interface Labelled {
  name: string;
  dt: number;
  qpos: number[][];
  pass: boolean;
}

export const traceOf = (poser: Poser, qpos: ArrayLike<number>[], signals: Record<string, SignalSource>): Trace =>
  poser.trace(
    qpos.map((q) => Float64Array.from(q)),
    ROLLOUT_DT,
    signals,
  );

export async function verdictOn(poser: Poser, rollout: Labelled, judged: Pick<TaskDraw, 'contract' | 'signals'>) {
  return (await evaluateContract(judged.contract, traceOf(poser, rollout.qpos, judged.signals))).passed;
}

export async function labelled(poser: Poser, draw: TaskDraw, variants: Variant[]): Promise<Labelled[]> {
  const out: Labelled[] = [];

  for (const v of variants) {
    const frames = framesOf(poser, v.keys, draw.horizonS);
    const qpos = frames.map((f) => Array.from(f));
    const result = await evaluateContract(draw.contract, poser.trace(frames, ROLLOUT_DT, draw.signals));

    out.push({ name: v.name, dt: ROLLOUT_DT, qpos, pass: result.passed });
  }

  return out;
}

export async function limpPasses(
  mj: MainModule,
  poser: Poser,
  judged: Pick<TaskDraw, 'contract' | 'signals' | 'horizonS' | 'startOffsetDeg'>,
) {
  const { engine, body } = poser;

  engine.reset(judged.startOffsetDeg ? offsetPose(body.model, judged.startOffsetDeg) : body.model.initial);
  engine.setController({ kind: 'limp' });

  const readers = signalReaders({ mj, engine, robot: body.model.robots[0].key }, judged.signals);
  const ticks = Math.floor(judged.horizonS / ROLLOUT_DT + 1e-9) + 1;
  const signals: Record<string, number[]> = Object.fromEntries(Object.keys(readers).map((n) => [n, []]));

  for (let tick = 0; tick < ticks; tick++) {
    if (tick > 0) engine.step(ROLLOUT_DT);

    for (const [name, read] of Object.entries(readers)) signals[name].push(read());
  }

  return (await evaluateContract(judged.contract as Contract, { dt: ROLLOUT_DT, signals })).passed;
}
