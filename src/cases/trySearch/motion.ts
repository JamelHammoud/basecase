import type { Recording } from '../../sim/recorder';
import { MOTION_SAMPLES, type MotionTrace } from './types';

export const SIGNATURE_SAMPLES = 32;

const round = (v: number) => Math.round(v * 1000) / 1000;

function resample(values: ArrayLike<number>, width: number, samples: number): number[] {
  const count = values.length / width;
  const out: number[] = [];

  for (let s = 0; s < samples; s++) {
    const at = count <= 1 ? 0 : (s / (samples - 1)) * (count - 1);
    const low = Math.floor(at);
    const high = Math.min(count - 1, low + 1);
    const mix = at - low;

    for (let k = 0; k < width; k++) out.push(values[low * width + k] * (1 - mix) + values[high * width + k] * mix);
  }

  return out;
}

function farthestBody(r: Recording): number {
  let best = 0;
  let bestLength = -1;

  for (let b = 0; b < r.nbody; b++) {
    let length = 0;

    for (let f = 1; f < r.frames; f++) {
      const at = (f * r.nbody + b) * 7;
      const was = ((f - 1) * r.nbody + b) * 7;

      length += Math.hypot(
        r.poses[at] - r.poses[was],
        r.poses[at + 1] - r.poses[was + 1],
        r.poses[at + 2] - r.poses[was + 2],
      );
    }

    if (length > bestLength) [best, bestLength] = [b, length];
  }

  return best;
}

function bodyPath(r: Recording, body: number): Float64Array {
  const path = new Float64Array(r.frames * 3);
  const start = body * 7;

  for (let f = 0; f < r.frames; f++) {
    const at = (f * r.nbody + body) * 7;

    for (let k = 0; k < 3; k++) path[f * 3 + k] = r.poses[at + k] - r.poses[start + k];
  }

  return path;
}

const isMobile = (r: Recording) => !!r.root && r.root[0] >= 0;

function jointDofs(r: Recording): number[] {
  if (r.jointDof?.length) return [...r.jointDof];

  const skip = isMobile(r) ? r.root![1] : -1;

  return Array.from({ length: r.nv }, (_, i) => i).filter((i) => skip < 0 || i < skip || i >= skip + 6);
}

function jointCount(r: Recording): number {
  if (r.jointQpos?.length) return r.jointQpos.length;

  return Math.max(0, r.nq - (isMobile(r) ? 7 : 0));
}

function meanSpeeds(r: Recording, dofs: number[]): Float64Array {
  const speeds = new Float64Array(r.frames);

  if (!dofs.length) return speeds;

  for (let f = 0; f < r.frames; f++) {
    let sum = 0;

    for (const d of dofs) sum += Math.abs(r.qvel[f * r.nv + d]);

    speeds[f] = sum / dofs.length;
  }

  return speeds;
}

export function motionTrace(r: Recording): MotionTrace | null {
  if (r.frames < 2 || r.nbody < 1 || r.poses.length < r.frames * r.nbody * 7) return null;

  return {
    body: isMobile(r) ? 'mobile' : 'fixed',
    joints: jointCount(r),
    path: resample(bodyPath(r, farthestBody(r)), 3, MOTION_SAMPLES).map(round),
    speed: resample(meanSpeeds(r, jointDofs(r)), 1, MOTION_SAMPLES).map(round),
  };
}

export const motionKey = (trace: MotionTrace) => `${trace.body}:${trace.joints}`;

const largest = (values: number[]) => values.reduce((most, v) => Math.max(most, Math.abs(v)), 0);

export function motionSignature(trace: MotionTrace): Float32Array {
  const path = resample(trace.path, 3, SIGNATURE_SAMPLES);
  const speed = resample(trace.speed, 1, SIGNATURE_SAMPLES);
  const start = path.slice(0, 3);
  const moved = path.map((v, i) => v - start[i % 3]);
  const extent = largest(moved);
  const fastest = largest(speed);
  const out = new Float32Array(moved.length + speed.length);

  moved.forEach((v, i) => (out[i] = extent > 1e-9 ? v / extent : 0));
  speed.forEach((v, i) => (out[moved.length + i] = fastest > 1e-9 ? (v / fastest) * Math.sqrt(3) : 0));

  const norm = Math.sqrt(out.reduce((sum, v) => sum + v * v, 0)) || 1;

  return out.map((v) => v / norm);
}

export function signatureDistance(a: ArrayLike<number>, b: ArrayLike<number>, scale = 1): number {
  let sum = 0;

  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;

  return Math.sqrt(sum) / scale;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const numbers = (v: unknown, length: number): v is number[] =>
  Array.isArray(v) && v.length === length && v.every((n) => typeof n === 'number' && Number.isFinite(n));

export function readMotion(v: unknown): MotionTrace | null {
  if (!isRecord(v) || (v.body !== 'fixed' && v.body !== 'mobile')) return null;

  if (!Number.isInteger(v.joints) || (v.joints as number) < 0) return null;

  if (!numbers(v.path, MOTION_SAMPLES * 3) || !numbers(v.speed, MOTION_SAMPLES)) return null;

  return { body: v.body, joints: v.joints as number, path: v.path, speed: v.speed };
}
