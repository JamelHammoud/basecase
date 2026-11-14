import type { Recording } from '../sim/recorder';
import { SEGMENT_RULES, framesOf, type SegmentJaw } from './segmentTypes';

const ROOT_QPOS = 7;
const ROOT_DOF = 6;

const rootOf = (r: Recording) => (r.root && r.root[0] >= 0 ? r.root : null);

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

const outside = (start: number, width: number) => (i: number) => i < start || i >= start + width;

function jointDofs(r: Recording): number[] {
  if (r.jointDof?.length) return [...r.jointDof];

  const root = rootOf(r);

  return root ? range(r.nv).filter(outside(root[1], ROOT_DOF)) : range(r.nv);
}

function jointAddresses(r: Recording): number[] {
  if (r.jointQpos?.length) return [...r.jointQpos];

  const root = rootOf(r);

  return root ? range(r.nq).filter(outside(root[0], ROOT_QPOS)) : range(r.nq);
}

function jawShare(r: Recording, jaw: SegmentJaw, f: number): number {
  const span = jaw.closed - jaw.open;
  const at = (r.qpos[f * r.nq + jaw.qpos] - jaw.open) / span;
  const commanded = jaw.ctrl === undefined ? at : (r.ctrl[f * r.nu + jaw.ctrl] - jaw.open) / span;

  return Math.max(at, commanded);
}

const usableJaw = (r: Recording) => (jaw: SegmentJaw) =>
  jaw.qpos >= 0 &&
  jaw.qpos < r.nq &&
  Math.abs(jaw.closed - jaw.open) > 1e-9 &&
  (jaw.ctrl === undefined || (jaw.ctrl >= 0 && jaw.ctrl < r.nu));

function nextClosed(closed: boolean, share: number): boolean {
  if (closed) return share >= SEGMENT_RULES.gripOpen;

  return share > SEGMENT_RULES.gripClose;
}

export function gripClosed(r: Recording, jaws: SegmentJaw[]): boolean[] | null {
  const usable = jaws.filter(usableJaw(r));

  if (!usable.length) return null;

  const out: boolean[] = [];
  const shareAt = (f: number) => usable.reduce((sum, jaw) => sum + jawShare(r, jaw, f), 0) / usable.length;
  let closed = shareAt(0) >= 0.5;

  for (let f = 0; f < r.frames; f++) {
    closed = f === 0 ? closed : nextClosed(closed, shareAt(f));
    out.push(closed);
  }

  return out;
}

function qvelSpeeds(r: Recording, dofs: number[]): Float64Array | null {
  const out = new Float64Array(r.frames);
  let moved = false;

  for (let f = 0; f < r.frames; f++) {
    for (const d of dofs) out[f] = Math.max(out[f], Math.abs(r.qvel[f * r.nv + d] ?? 0));

    moved ||= out[f] > 0;
  }

  return moved ? out : null;
}

function qposSpeeds(r: Recording, addresses: number[]): Float64Array {
  const out = new Float64Array(r.frames);

  for (let f = 0; f < r.frames; f++) {
    const before = Math.max(0, f - 1);
    const after = Math.min(r.frames - 1, f + 1);
    const seconds = Math.max(1, after - before) * r.dt;

    for (const a of addresses)
      out[f] = Math.max(out[f], Math.abs(r.qpos[after * r.nq + a] - r.qpos[before * r.nq + a]) / seconds);
  }

  return out;
}

export function jointSpeeds(r: Recording): Float64Array {
  const dofs = jointDofs(r).filter((d) => d >= 0 && d < r.nv);

  return (dofs.length && qvelSpeeds(r, dofs)) || qposSpeeds(r, jointAddresses(r));
}

export function pausesOf(still: boolean[], dt: number): boolean[] {
  const least = framesOf(SEGMENT_RULES.pauseS, dt);
  const out = still.map(() => false);
  let start = 0;

  for (let f = 0; f <= still.length; f++) {
    if (f < still.length && still[f]) continue;

    if (f - start >= least) out.fill(true, start, f);

    start = f + 1;
  }

  return out;
}

export interface BaseMotion {
  speed: Float64Array;
  yawRate: Float64Array;
}

const yawOf = (q: ArrayLike<number>, at: number) =>
  Math.atan2(2 * (q[at] * q[at + 3] + q[at + 1] * q[at + 2]), 1 - 2 * (q[at + 2] ** 2 + q[at + 3] ** 2));

const wrapped = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export function baseMotion(r: Recording): BaseMotion | null {
  const root = rootOf(r);

  if (!root || root[0] + ROOT_QPOS > r.nq) return null;

  const speed = new Float64Array(r.frames);
  const yawRate = new Float64Array(r.frames);
  const w = SEGMENT_RULES.speedWindow;
  const at = (f: number) => f * r.nq + root[0];

  for (let f = 0; f < r.frames; f++) {
    const before = Math.max(0, f - w);
    const after = Math.min(r.frames - 1, f + w);
    const seconds = Math.max(1, after - before) * r.dt;
    const [a, b] = [at(before), at(after)];

    speed[f] = Math.hypot(r.qpos[b] - r.qpos[a], r.qpos[b + 1] - r.qpos[a + 1]) / seconds;
    yawRate[f] = Math.abs(wrapped(yawOf(r.qpos, b + 3) - yawOf(r.qpos, a + 3))) / seconds;
  }

  return { speed, yawRate };
}

export function baseVerb(motion: BaseMotion, f: number): 'walk' | 'turn' | null {
  const { speed, yawRate } = motion;

  if (speed[f] < SEGMENT_RULES.stillBaseMS && yawRate[f] < SEGMENT_RULES.stillYawRadS) return null;

  return yawRate[f] * SEGMENT_RULES.turnRadiusM > speed[f] ? 'turn' : 'walk';
}
