import type { V3 } from '../../utils/kinematics';
import { isSeen, POSE, toHuman, type PoseLandmark } from '../operator/poseLandmarks';

export const GESTURE_POINTS = [
  'nose',
  'leftEar',
  'rightEar',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftIndex',
  'rightIndex',
  'leftPinky',
  'rightPinky',
  'leftThumb',
  'rightThumb',
] as const;

export type GesturePoint = (typeof GESTURE_POINTS)[number];

export const GESTURE_FEATURES = GESTURE_POINTS.length * 3;

export interface GestureFrame {
  t: number;
  p: Float64Array;
}

const HEAD: ReadonlySet<GesturePoint> = new Set(['nose', 'leftEar', 'rightEar']);
const SLOT = new Map(GESTURE_POINTS.map((name, i) => [name, i * 3]));
const MIN_SHOULDERS_M = 0.05;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const norm = (a: V3): V3 => {
  const n = Math.hypot(...a);

  return [a[0] / n, a[1] / n, a[2] / n];
};

export function point(frame: GestureFrame, name: GesturePoint): V3 {
  const i = SLOT.get(name)!;

  return [frame.p[i], frame.p[i + 1], frame.p[i + 2]];
}

export function gestureFrame(world: PoseLandmark[], t: number): GestureFrame | null {
  const left = world[POSE.leftShoulder];
  const right = world[POSE.rightShoulder];

  if (!isSeen(left) || !isSeen(right)) return null;

  const l = toHuman(left);
  const r = toHuman(right);
  const across = sub(l, r);
  const width = Math.hypot(...across);

  if (width < MIN_SHOULDERS_M) return null;

  const x = norm(across);
  const y = norm(sub([0, 1, 0], [x[0] * x[1], x[1] * x[1], x[2] * x[1]]));
  const z = cross(x, y);
  const origin: V3 = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2];
  const p = new Float64Array(GESTURE_FEATURES).fill(Number.NaN);

  GESTURE_POINTS.forEach((name, k) => {
    const mark = world[POSE[name]];

    if (!mark || (!HEAD.has(name) && !isSeen(mark))) return;

    const d = sub(toHuman(mark), origin);

    p.set([dot(d, x) / width, dot(d, y) / width, dot(d, z) / width], k * 3);
  });

  return { t, p };
}
