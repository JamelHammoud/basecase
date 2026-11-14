import type { V3 } from '../utils/kinematics';

export interface SegmentJaw {
  actuator: number;
  qpos: number;
  open: number;
  closed: number;
}

export interface SegmentObject {
  name: string;
  body: number;
  sizeMm: number;
}

export interface SegmentEffector {
  body: number;
  offset: V3;
}

export type SegmentMobility = 'legs' | 'wheels' | null;

export interface SegmentRobot {
  bodies: number[];
  root: number | null;
  mobility: SegmentMobility;
  jaws: SegmentJaw[];
  effector: SegmentEffector | null;
  objects: SegmentObject[];
}

export interface SegmentFrames {
  frames: number;
  dt: number;
  nbody: number;
  nu: number;
  nq: number;
  poses: ArrayLike<number>;
  ctrl: ArrayLike<number>;
  qpos: ArrayLike<number>;
}

export interface Run {
  start: number;
  end: number;
}

export const PAUSE_S = 0.3;
export const IDLE_S = 2;
export const STILL_MM_S = 15;

const CLOSE_SHARE = 0.6;
const OPEN_SHARE = 0.4;

export function bodyAt(r: SegmentFrames, frame: number, body: number): V3 {
  const at = (Math.max(0, Math.min(r.frames - 1, frame)) * r.nbody + body) * 7;

  return [r.poses[at] * 1000, r.poses[at + 2] * 1000, -r.poses[at + 1] * 1000];
}

function rotate(r: SegmentFrames, frame: number, body: number, v: V3): V3 {
  const at = (Math.max(0, Math.min(r.frames - 1, frame)) * r.nbody + body) * 7 + 3;
  const w = r.poses[at];
  const x = r.poses[at + 1];
  const y = r.poses[at + 3];
  const z = -r.poses[at + 2];
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);

  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

export function effectorAt(r: SegmentFrames, frame: number, effector: SegmentEffector): V3 {
  const p = bodyAt(r, frame, effector.body);
  const o = rotate(r, frame, effector.body, effector.offset);

  return [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
}

export const distance = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const across = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function yawAt(r: SegmentFrames, frame: number, body: number): number {
  const forward = rotate(r, frame, body, [0, 0, 1]);

  return Math.atan2(forward[0], forward[2]);
}

const valid = (v: number) => Number.isFinite(v);

export function speeds(r: SegmentFrames, bodies: number[]): Float32Array {
  const out = new Float32Array(r.frames);

  for (let f = 0; f < r.frames; f++) {
    const before = Math.max(0, f - 1);
    const after = Math.min(r.frames - 1, f + 1);
    const span = Math.max(after - before, 1) * r.dt;
    let worst = 0;

    for (const b of bodies) {
      const moved = distance(bodyAt(r, after, b), bodyAt(r, before, b)) / span;

      if (valid(moved)) worst = Math.max(worst, moved);
    }

    out[f] = worst;
  }

  return out;
}

export function runsOf(flags: ArrayLike<boolean>, minFrames: number): Run[] {
  const runs: Run[] = [];
  let start = -1;

  for (let f = 0; f <= flags.length; f++) {
    const on = f < flags.length && flags[f];

    if (on && start < 0) start = f;

    if (!on && start >= 0 && f - start >= minFrames) runs.push({ start, end: f });

    if (!on) start = -1;
  }

  return runs;
}

export const pausesOf = (r: SegmentFrames, moving: Float32Array, seconds = PAUSE_S): Run[] =>
  runsOf(
    Array.from(moving, (v) => v < STILL_MM_S),
    Math.max(1, Math.round(seconds / r.dt)),
  );

function jawShare(r: SegmentFrames, jaw: SegmentJaw, frame: number): number {
  const span = jaw.closed - jaw.open;
  const commanded = jaw.actuator >= 0 && r.nu > 0 ? r.ctrl[frame * r.nu + jaw.actuator] : Number.NaN;
  const value = valid(commanded) ? commanded : r.qpos[frame * r.nq + jaw.qpos];

  return Math.abs(span) < 1e-9 || !valid(value) ? Number.NaN : (value - jaw.open) / span;
}

export function gripRuns(r: SegmentFrames, jaws: SegmentJaw[]): Run[] {
  if (!jaws.length) return [];

  const closed: boolean[] = [];
  let shut = false;

  for (let f = 0; f < r.frames; f++) {
    const shares = jaws.map((j) => jawShare(r, j, f)).filter(valid);
    const share = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : Number.NaN;

    if (valid(share)) shut = shut ? share > OPEN_SHARE : share > CLOSE_SHARE;

    closed.push(shut);
  }

  return runsOf(closed, 1);
}
