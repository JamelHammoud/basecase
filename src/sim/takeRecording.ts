import type { Take } from '../../electron/robot/robotTake.mjs';
import type { SimEngine } from './engine';
import { RECORD_HZ, type Recording } from './recorder';

export type { Take };

const MAX_FRAMES = 600 * RECORD_HZ;
const EARLY = 1e-9;

export interface TakeScrub {
  recording: Recording;
  named: boolean[];
  measured: Array<Float32Array | null>;
}

export interface ScrubbedTake {
  recording: Recording;
  efforts: Float32Array[];
}

function keepFinite(into: Float64Array, row: Float32Array) {
  row.forEach((v, k) => {
    if (Number.isFinite(v)) into[k] = v;
  });
}

class Held {
  readonly values: Float64Array;

  private readonly times: Float64Array;

  private readonly rows: Float32Array | null;

  private next = 0;

  constructor(times: Float64Array, rows: Float32Array | null, seed: Float64Array) {
    this.times = times;
    this.rows = rows;
    this.values = seed;
  }

  at(time: number): Float64Array {
    const { rows, values } = this;
    const width = values.length;

    while (this.next < this.times.length && this.times[this.next] <= time + EARLY) {
      if (rows) keepFinite(values, rows.subarray(this.next * width, (this.next + 1) * width));

      this.next++;
    }

    return values;
  }
}

function firstFinite(rows: Float32Array | null, width: number): Float64Array {
  const out = new Float64Array(width).fill(Number.NaN);

  if (!rows || !width) return out;

  for (let at = rows.length - width; at >= 0; at -= width) keepFinite(out, rows.subarray(at, at + width));

  return out;
}

interface Frames {
  frames: number;
  dt: number;
}

export function takeFrames(take: Take): Frames {
  const dt = 1 / RECORD_HZ;

  if (!take.frames) return { frames: 0, dt };

  const span = Math.max(0, take.t[take.frames - 1] - take.t[0]);
  const frames = Math.floor(span * RECORD_HZ + EARLY) + 1;

  if (frames <= MAX_FRAMES) return { frames, dt };

  return { frames: MAX_FRAMES, dt: span / (MAX_FRAMES - 1) };
}

interface Plan {
  columns: Int32Array;
  qposAt: Int32Array;
  dofAt: Int32Array;
  qpos0: Float64Array;
  position: Held;
  velocity: Held;
  intent: Held;
  effort: Held;
}

function planOf(engine: SimEngine, take: Take): Plan {
  const width = take.joints.length;
  const seen = firstFinite(take.position, width);
  const columns = Int32Array.from(engine.sim.joints, (j) => {
    const k = take.joints.indexOf(j.id);

    return k >= 0 && Number.isFinite(seen[k]) ? k : -1;
  });

  return {
    columns,
    qposAt: engine.jointAddresses(),
    dofAt: engine.dofAddresses(),
    qpos0: Float64Array.from(engine.model.qpos0),
    position: new Held(take.t, take.position, seen),
    velocity: new Held(take.t, take.velocity, new Float64Array(width)),
    intent: new Held(take.intentT, take.intent, new Float64Array(width).fill(Number.NaN)),
    effort: new Held(take.t, take.effort, new Float64Array(width).fill(Number.NaN)),
  };
}

function setFrame(engine: SimEngine, plan: Plan, time: number) {
  const { data, sim } = engine;
  const position = plan.position.at(time);
  const velocity = plan.velocity.at(time);
  const intent = plan.intent.at(time);

  data.qpos.set(plan.qpos0);
  data.qvel.fill(0);
  data.ctrl.fill(0);
  sim.joints.forEach((j, i) => {
    const k = plan.columns[i];
    const at = plan.qposAt[i];

    if (k >= 0) {
      data.qpos[at] = position[k];
      data.qvel[plan.dofAt[i]] = velocity[k];
    }

    if (j.actuator < 0 || j.drive !== 'position') return;

    data.ctrl[j.actuator] = k >= 0 && Number.isFinite(intent[k]) ? intent[k] : data.qpos[at];
  });
}

function emptyRecording(engine: SimEngine, { frames, dt }: Frames): Recording {
  const { model } = engine;
  const nbody = engine.sim.bodies.length;

  return {
    dt,
    frames,
    nq: model.nq,
    nv: model.nv,
    nu: model.nu,
    nbody,
    t: Float32Array.from({ length: frames }, (_, n) => n * dt),
    ctrl: new Float32Array(frames * model.nu),
    qpos: new Float64Array(frames * model.nq),
    qvel: new Float32Array(frames * model.nv),
    poses: new Float32Array(frames * nbody * 7),
    jointQpos: engine.jointAddresses(),
    jointDof: engine.dofAddresses(),
    root: engine.rootAddresses(),
    faults: [],
  };
}

function measuredLanes(plan: Plan, take: Take, frames: number): Array<Float32Array | null> {
  const seen = firstFinite(take.effort, take.joints.length);

  return Array.from(plan.columns, (k) => (k >= 0 && Number.isFinite(seen[k]) ? new Float32Array(frames) : null));
}

function snapshot(engine: SimEngine) {
  const { data } = engine;

  return {
    time: data.time,
    qpos: Float64Array.from(data.qpos),
    qvel: Float64Array.from(data.qvel),
    ctrl: Float64Array.from(data.ctrl),
  };
}

function restore(engine: SimEngine, saved: ReturnType<typeof snapshot>) {
  const { data } = engine;

  data.time = saved.time;
  data.qpos.set(saved.qpos);
  data.qvel.set(saved.qvel);
  data.ctrl.set(saved.ctrl);
  engine.refreshKinematics();
}

export function takeRecording(engine: SimEngine, take: Take): TakeScrub | null {
  const span = takeFrames(take);
  const { frames } = span;
  const plan = planOf(engine, take);

  if (!frames || plan.columns.every((k) => k < 0)) return null;

  const saved = snapshot(engine);
  const r = emptyRecording(engine, span);
  const measured = measuredLanes(plan, take, frames);
  const poses = new Float64Array(r.nbody * 7);
  const { data } = engine;

  for (let n = 0; n < frames; n++) {
    const time = take.t[0] + n * r.dt;

    setFrame(engine, plan, time);
    engine.refreshKinematics();
    r.qpos.set(data.qpos, n * r.nq);
    r.qvel.set(data.qvel, n * r.nv);
    r.ctrl.set(data.ctrl, n * r.nu);
    r.poses.set(engine.poses(poses), n * poses.length);

    const effort = plan.effort.at(time);

    measured.forEach((lane, i) => {
      if (lane) lane[n] = effort[plan.columns[i]];
    });
  }

  restore(engine, saved);

  return { recording: r, named: Array.from(plan.columns, (k) => k >= 0), measured };
}

export const takeEfforts = (scrub: TakeScrub, simulated: () => Float32Array[]): Float32Array[] => {
  const missing = scrub.named.some((named, i) => named && !scrub.measured[i]);
  const sim = missing ? simulated() : [];

  return scrub.named.map((named, i) => {
    if (!named) return new Float32Array(0);

    return scrub.measured[i] ?? sim[i] ?? new Float32Array(0);
  });
};

export function openTake(
  engine: SimEngine,
  take: Take,
  simulated: (engine: SimEngine, r: Recording) => Float32Array[],
): ScrubbedTake | null {
  const scrub = takeRecording(engine, take);

  return scrub && { recording: scrub.recording, efforts: takeEfforts(scrub, () => simulated(engine, scrub.recording)) };
}
