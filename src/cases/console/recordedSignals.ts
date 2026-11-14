import type { DriveCommand } from '../../sim/driveTypes';
import type { SimModel } from '../../sim/mjcfTypes';
import { framePoses, type Recording } from '../../sim/recorder';
import type { Trace } from '../../skills/contract';
import type { GoalJudge } from '../goalJudge';
import { endPoint, type ProbeWorld } from '../probes';
import type { Trip } from '../tripFrames';
import type { ConsoleSignal } from './format';
import {
  baseValues,
  freshClock,
  NO_SERIES,
  withCaseValues,
  type Series,
  type SignalBus,
  type SignalSample,
  type SignalValue,
} from './signalBus';
import { matches } from './signalNames';

const D2R = Math.PI / 180;

export interface Verdict {
  frame: number;
  passed: boolean;
  margin: number;
}

export interface RecordedScene {
  model: SimModel;
  recording: Recording;
  efforts: readonly Float32Array[] | null;
  world: ProbeWorld | null;
  trace: Trace | null;
  probes: readonly string[];
  trips: readonly Trip[];
  verdicts: readonly Verdict[];
}

export interface RecordedConsole {
  inputs: readonly string[];
  signals?: readonly ConsoleSignal[];
  cameras: readonly string[];
}

export interface SignalTrack {
  t: number[];
  numbers: Map<string, number[]>;
  labels: Map<string, string[][]>;
}

export interface RecordedBus extends SignalBus {
  seek: (frame: number) => void;
  frame: () => number;
  track: SignalTrack;
}

const jointsAt = ({ model, recording: r, efforts }: RecordedScene, n: number): SignalSample['joints'] =>
  model.joints.map((j, i) => {
    const unit = j.type === 'revolute' ? D2R : 0.001;
    const address = r.jointQpos?.[i];
    const position = address === undefined ? Number.NaN : r.qpos[n * r.nq + address];
    const target = j.actuator >= 0 && j.drive === 'position' ? r.ctrl[n * r.nu + j.actuator] : position;
    const effort = j.actuator >= 0 ? (efforts?.[i]?.[n] ?? 0) : 0;

    return { id: j.id, target: target / unit, position: position / unit, effort };
  });

const rootBody = (model: SimModel) => {
  const root = model.robots[0]?.root;

  return root === undefined ? -1 : model.bodies.findIndex((b) => b.name === root);
};

function robotAt(scene: RecordedScene, n: number, poses: Float64Array): SignalSample['robot'] {
  const { recording: r, world } = scene;
  const body = rootBody(scene.model);
  const dof = r.root?.[1] ?? -1;
  const base = world ? endPoint('base', world, poses) : null;
  const flat = base ? { x: base.x, z: base.z } : {};

  if (body < 0) return { height: 0, tilt: 0, speed: 0, travelled: 0, ...flat };

  const at = body * 7;
  const start = framePoses(r, 0);
  const [qx, qy] = [poses[at + 4], poses[at + 5]];
  const zz = Math.max(-1, Math.min(1, 1 - 2 * (qx * qx + qy * qy)));

  return {
    height: poses[at + 2] - start[at + 2],
    tilt: Math.acos(zz) / D2R,
    speed: dof >= 0 ? Math.hypot(r.qvel[n * r.nv + dof], r.qvel[n * r.nv + dof + 1]) : 0,
    travelled: Math.hypot(poses[at] - start[at], poses[at + 1] - start[at + 1]),
    ...flat,
  };
}

function commandAt(r: Recording, time: number): DriveCommand | null {
  let found: DriveCommand | null = null;

  for (const c of r.commands ?? []) {
    if (c.at > time + 1e-9) break;

    if (!c.command.slot) found = c.command;
  }

  return found;
}

const latest = <T extends { frame: number }>(list: readonly T[], n: number) => list.findLast((x) => x.frame <= n);

function goalAt({ trips, verdicts }: RecordedScene, n: number): NonNullable<SignalSample['goal']> {
  const verdict = latest(verdicts, n);

  return {
    passed: verdict ? verdict.passed : false,
    margin: verdict ? verdict.margin : Number.NaN,
    failed: trips.filter((t) => t.frame <= n).map((t) => t.label),
  };
}

export function recordedSample(scene: RecordedScene, con: RecordedConsole, n: number): SignalSample {
  const r = scene.recording;
  const time = r.t[n] ?? n * r.dt;
  const poses = framePoses(r, n);
  const command = commandAt(r, time);

  return {
    time,
    running: true,
    joints: jointsAt(scene, n),
    robot: robotAt(scene, n, poses),
    probes: Object.fromEntries(scene.probes.map((p) => [p, scene.trace?.signals[p]?.[n] ?? Number.NaN])),
    inputs: Object.fromEntries(con.inputs.map((id) => [id, command])),
    goal: goalAt(scene, n),
    cameras: [...con.cameras],
  };
}

function column<T>(columns: Map<string, T[]>, id: string, frames: number, empty: T): T[] {
  const existing = columns.get(id);

  if (existing) return existing;

  const made = new Array<T>(frames).fill(empty);

  columns.set(id, made);

  return made;
}

export function recordedTrack(scene: RecordedScene, con: RecordedConsole): SignalTrack {
  const frames = scene.recording.frames;
  const defs = con.signals ?? [];
  const clock = freshClock();
  const track: SignalTrack = { t: [], numbers: new Map(), labels: new Map() };

  for (let n = 0; n < frames; n++) {
    const sample = recordedSample(scene, con, n);
    const step = clock.last === null ? 0 : sample.time - clock.last;

    if (step > 0 && step < 1) clock.elapsed += step;

    clock.last = sample.time;
    track.t.push(sample.time);
    withCaseValues(defs, baseValues(sample), clock, true).forEach((v, id) => {
      if (typeof v === 'number') column(track.numbers, id, frames, Number.NaN)[n] = v;
      else column<string[]>(track.labels, id, frames, [])[n] = v;
    });
  }

  return track;
}

export function trackValues(track: SignalTrack, frame: number): Map<string, SignalValue> {
  const out = new Map<string, SignalValue>();

  track.numbers.forEach((v, id) => {
    if (!Number.isNaN(v[frame])) out.set(id, v[frame]);
  });
  track.labels.forEach((v, id) => out.set(id, v[frame] ?? []));

  return out;
}

export function recordedBus(track: SignalTrack): RecordedBus {
  const last = Math.max(track.t.length - 1, 0);
  const listeners = new Set<() => void>();
  const ids = [...track.numbers.keys(), ...track.labels.keys()];
  let frame = 0;
  let values = trackValues(track, 0);
  let version = 0;

  const seriesOf = (id: string): Series => {
    const v = track.numbers.get(id);

    return v ? { t: track.t, v } : NO_SERIES;
  };

  return {
    track,
    push: () => {},
    reset: () => {},
    read: (id) => values.get(id),
    series: seriesOf,
    expand: (pattern) => (pattern.includes('*') ? ids.filter((id) => matches(pattern, id)) : [pattern]),
    subscribe(listen) {
      listeners.add(listen);

      return () => {
        listeners.delete(listen);
      };
    },
    version: () => version,
    playhead: () => ({ at: track.t[frame] ?? 0, end: track.t[last] ?? 0, frame }),
    frame: () => frame,
    seek(to) {
      const next = Math.max(0, Math.min(last, Math.round(to)));

      if (next === frame && version > 0) return;

      frame = next;
      values = trackValues(track, frame);
      version++;
      listeners.forEach((l) => l());
    },
  };
}

export const frameAtTime = (track: SignalTrack, time: number) => {
  const after = track.t.findIndex((t) => t > time);

  if (after < 0) return Math.max(track.t.length - 1, 0);

  if (after === 0) return 0;

  return time - track.t[after - 1] <= track.t[after] - time ? after - 1 : after;
};

export const JUDGE_EVERY_S = 0.5;

export async function goalVerdicts(judge: GoalJudge, trace: Trace, every = JUDGE_EVERY_S): Promise<Verdict[]> {
  const ticks = Object.values(trace.signals).reduce((n, s) => Math.max(n, s.length), 0);
  const step = Math.max(1, Math.round(every / trace.dt));
  const verdicts: Verdict[] = [];

  try {
    for (let from = 0; from < ticks; from += step) {
      const to = Math.min(ticks, from + step);
      const delta = Object.fromEntries(Object.entries(trace.signals).map(([k, s]) => [k, s.slice(from, to)]));
      const result = await judge.judge(trace.dt, delta);

      if (result) verdicts.push({ frame: to - 1, passed: result.passed, margin: result.margin });
    }
  } finally {
    judge.dispose();
  }

  return verdicts;
}
