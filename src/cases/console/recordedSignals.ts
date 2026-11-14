import type { DriveCommand } from '../../sim/driveTypes';
import type { SimModel } from '../../sim/mjcfTypes';
import { framePoses, type RecordedCommand, type Recording } from '../../sim/recorder';
import type { Trace } from '../../skills/contract';
import type { GoalJudge } from '../goalJudge';
import { endPoint, type ProbeReader, type ProbeWorld } from '../probes';
import type { ConsoleSignal } from './format';
import { jointUnit, lastProbes } from './liveSample';
import { baseValues, caseClock, type Series, type SignalSample, type SignalTrack, type SignalValue } from './signalBus';
import { matches } from './signalNames';

export interface GoalMark {
  frame: number;
  passed: boolean;
  margin: number;
  failed: string[];
}

export interface RecordedSource {
  recording: Recording;
  model: SimModel;
  efforts?: readonly Float32Array[] | null;
  probes?: { reader: ProbeReader; world: ProbeWorld } | null;
  goal?: readonly GoalMark[];
  inputs: readonly string[];
  cameras: readonly string[];
  signals?: readonly ConsoleSignal[];
}

export interface RecordedTrack extends SignalTrack {
  ids: string[];
  goalAt: (frame: number) => GoalMark | null;
}

const D2R = Math.PI / 180;
const GOAL_EVERY_S = 0.5;

function effortAt({ recording: r, model, efforts }: RecordedSource, i: number, n: number): number {
  const { actuator } = model.joints[i];

  if (actuator < 0) return 0;

  return r.force ? r.force[n * r.nu + actuator] : (efforts?.[i]?.[n] ?? 0);
}

function jointsAt(src: RecordedSource, n: number): SignalSample['joints'] {
  const { recording: r, model } = src;

  return model.joints.map((j, i) => {
    const unit = jointUnit(j.type);
    const address = r.jointQpos?.[i];
    const position = address === undefined ? Number.NaN : r.qpos[n * r.nq + address];
    const target = j.actuator >= 0 && j.drive === 'position' ? r.ctrl[n * r.nu + j.actuator] : position;

    return { id: j.id, target: target / unit, position: position / unit, effort: effortAt(src, i, n) };
  });
}

function rootAt(r: Recording, n: number) {
  const [q, d] = r.root ?? [-1, -1];

  if (q < 0) return null;

  const at = n * r.nq + q;
  const [x, y, z, , qx, qy] = r.qpos.subarray(at, at + 7);
  const zz = 1 - 2 * (qx * qx + qy * qy);
  const speed = d < 0 ? 0 : Math.hypot(r.qvel[n * r.nv + d], r.qvel[n * r.nv + d + 1]);

  return { x, y, z, tilt: Math.acos(Math.max(-1, Math.min(1, zz))) / D2R, speed };
}

function robotAt(src: RecordedSource, n: number, poses: Float64Array): SignalSample['robot'] {
  const start = rootAt(src.recording, 0);
  const now = rootAt(src.recording, n);
  const base = src.probes ? endPoint('base', src.probes.world, poses) : null;
  const floor = base ? { x: base.x, z: base.z } : {};

  if (!src.model.robots.length) return floor;

  if (!start || !now) return { height: 0, tilt: 0, speed: 0, travelled: 0, ...floor };

  return {
    height: now.z - start.z,
    tilt: now.tilt,
    speed: now.speed,
    travelled: Math.hypot(now.x - start.x, now.y - start.y),
    ...floor,
  };
}

const probesAt = (src: RecordedSource, poses: Float64Array) => (src.probes ? lastProbes(src.probes.reader, poses) : {});

function commandAt(commands: readonly RecordedCommand[], time: number): DriveCommand | null {
  let found: DriveCommand | null = null;

  for (const c of commands) {
    if (c.at > time + 1e-9) break;

    found = c.command;
  }

  return found;
}

function goalOf(marks: readonly GoalMark[], frame: number): GoalMark | null {
  let found: GoalMark | null = null;

  for (const m of marks) {
    if (m.frame > frame) break;

    found = m;
  }

  return found;
}

export function recordedSample(src: RecordedSource, n: number): SignalSample {
  const { recording: r } = src;
  const time = r.t[n] ?? n * r.dt;
  const poses = framePoses(r, n);
  const command = commandAt(r.commands ?? [], time);
  const goal = goalOf(src.goal ?? [], n);

  return {
    time,
    running: true,
    joints: jointsAt(src, n),
    robot: robotAt(src, n, poses),
    probes: probesAt(src, poses),
    inputs: Object.fromEntries(src.inputs.map((id) => [id, command])),
    goal: goal && { passed: goal.passed, margin: goal.margin, failed: goal.failed },
    cameras: [...src.cameras],
  };
}

const SLICE_MS = 8;

const nextSlice = () => new Promise((resolve) => setTimeout(resolve, 0));

async function columnsOf(src: RecordedSource) {
  const { frames } = src.recording;
  const clock = caseClock(src.signals ?? []);
  const columns = new Map<string, Float64Array>();
  let slice = performance.now();

  for (let n = 0; n < frames; n++) {
    const sample = recordedSample(src, n);

    clock.next(baseValues(sample), sample.time, true).forEach((v, id) => {
      if (typeof v !== 'number') return;

      const column = columns.get(id) ?? new Float64Array(frames).fill(Number.NaN);

      column[n] = v;
      columns.set(id, column);
    });

    if (performance.now() - slice < SLICE_MS) continue;

    await nextSlice();
    slice = performance.now();
  }

  return columns;
}

export async function recordedTrack(src: RecordedSource): Promise<RecordedTrack> {
  const r = src.recording;
  const frames = Math.max(r.frames, 1);
  const columns = await columnsOf(src);
  const marks = src.goal ?? [];
  const cache = new Map<string, Series>();
  const clamp = (frame: number) => Math.max(0, Math.min(frames - 1, Math.round(frame)));
  const time = (frame: number) => r.t[clamp(frame)] ?? clamp(frame) * r.dt;

  const series = (id: string): Series => {
    const column = columns.get(id);

    if (!column) return { t: [], v: [] };

    const held = cache.get(id);

    if (held) return held;

    const out: Series = { t: [], v: [] };

    column.forEach((v, n) => {
      if (Number.isNaN(v)) return;

      out.t.push(time(n));
      out.v.push(v);
    });
    cache.set(id, out);

    return out;
  };

  const values = (frame: number) => {
    const n = clamp(frame);
    const out = new Map<string, SignalValue>();

    columns.forEach((column, id) => {
      if (!Number.isNaN(column[n])) out.set(id, column[n]);
    });

    const goal = goalOf(marks, n);

    if (goal) out.set('goal.failed', goal.failed);

    for (const key of src.cameras) out.set(`camera.${key}`, [key]);

    return out;
  };

  return {
    frames,
    dt: r.dt,
    ids: [...columns.keys()],
    time,
    values,
    series,
    column: (id: string) => columns.get(id) ?? null,
    frameAt: (seconds: number) => clamp(seconds / r.dt),
    goalAt: (frame: number) => goalOf(marks, clamp(frame)),
  };
}

const sliceTrace = (trace: Trace, from: number, to: number) =>
  Object.fromEntries(Object.entries(trace.signals).map(([k, s]) => [k, s.slice(from, to)]));

export async function goalMarks(judge: GoalJudge, trace: Trace): Promise<GoalMark[]> {
  const ticks = Object.values(trace.signals).reduce((n, s) => Math.max(n, s.length), 0);
  const every = Math.max(1, Math.round(GOAL_EVERY_S / trace.dt));
  const marks: GoalMark[] = [];

  for (let sent = 0; sent < ticks; sent += every) {
    const to = Math.min(ticks, sent + every);
    const result = await judge.judge(trace.dt, sliceTrace(trace, sent, to));

    if (result) marks.push({ frame: to - 1, passed: result.passed, margin: result.margin, failed: result.failed });
  }

  return marks;
}

export function sampled(track: RecordedTrack, patterns: readonly string[]): string[] {
  return track.ids.filter((id) => patterns.some((p) => matches(p, id)));
}
