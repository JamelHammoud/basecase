import type { V3 } from '../../../utils/kinematics';
import type { HandSample } from '../handFollow';
import { LAPTOP_ASPECT, LAPTOP_FOCAL } from '../laptopLens';
import type { PoseLandmark } from '../poseLandmarks';
import { seeded } from './seeded';

export const HAND_FPS = 30;
export const HAND_MOVE_M = 0.1;

const REST = 30;
const MOVE = 30;
const PINCH = 15;
const HOLD = 15;
const DEPTH_M = 0.45;
const START: V3 = [-0.05, 0.1, DEPTH_M];
const WORLD_NOISE_M = 0.0015;
const IMAGE_NOISE = 0.0012;

export const HAND_FRAMES = REST + MOVE + PINCH + HOLD;
export const HAND_MOVED_AT = REST + MOVE - 1;

const OPEN: V3[] = [
  [0, 0, 0],
  [-0.03, 0.025, 0.01],
  [-0.05, 0.045, 0.018],
  [-0.064, 0.066, 0.022],
  [-0.074, 0.086, 0.024],
  [-0.025, 0.09, 0],
  [-0.028, 0.13, 0.002],
  [-0.03, 0.155, 0.004],
  [-0.031, 0.176, 0.006],
  [0, 0.093, 0],
  [0, 0.137, 0.002],
  [0, 0.165, 0.004],
  [0, 0.188, 0.006],
  [0.022, 0.088, 0],
  [0.024, 0.127, 0.002],
  [0.026, 0.152, 0.004],
  [0.027, 0.172, 0.006],
  [0.042, 0.078, 0],
  [0.047, 0.107, 0.002],
  [0.05, 0.126, 0.004],
  [0.052, 0.143, 0.006],
];

const PINCHED: Partial<Record<number, V3>> = {
  3: [-0.058, 0.095, 0.04],
  4: [-0.047, 0.117, 0.046],
  7: [-0.035, 0.135, 0.03],
  8: [-0.043, 0.121, 0.046],
};

const smooth = (u: number) => {
  const c = Math.min(1, Math.max(0, u));

  return c * c * (3 - 2 * c);
};

const lerp = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function handShape(pinching: number): V3[] {
  return OPEN.map((p, i) => lerp(p, PINCHED[i] ?? p, pinching));
}

function cameraPoints(frame: number): V3[] {
  const along = smooth((frame - REST) / MOVE) * HAND_MOVE_M;
  const pinching = smooth((frame - REST - MOVE) / PINCH);
  const wrist: V3 = [START[0] + along, START[1], START[2]];

  return handShape(pinching).map(([right, up, toward]) => [wrist[0] + right, wrist[1] - up, wrist[2] - toward]);
}

function project(points: V3[], jitter: () => number): PoseLandmark[] {
  const wristDepth = points[0][2];

  return points.map(([x, y, z]) => ({
    x: 0.5 + (LAPTOP_FOCAL * x) / (z * LAPTOP_ASPECT) + jitter() * IMAGE_NOISE,
    y: 0.5 + (LAPTOP_FOCAL * y) / z + jitter() * IMAGE_NOISE,
    z: ((z - wristDepth) * LAPTOP_FOCAL) / (wristDepth * LAPTOP_ASPECT),
  }));
}

function centred(points: V3[], jitter: () => number): PoseLandmark[] {
  const mean = [0, 1, 2].map((i) => points.reduce((sum, p) => sum + p[i], 0) / points.length);

  return points.map((p) => ({
    x: p[0] - mean[0] + jitter() * WORLD_NOISE_M,
    y: p[1] - mean[1] + jitter() * WORLD_NOISE_M,
    z: p[2] - mean[2] + jitter() * WORLD_NOISE_M,
  }));
}

export function handMovesRight(): HandSample[] {
  const random = seeded(242);
  const jitter = () => random() * 2 - 1;

  return Array.from({ length: HAND_FRAMES }, (_, frame) => {
    const points = cameraPoints(frame);

    return {
      t: Math.round((frame * 1000) / HAND_FPS),
      image: project(points, jitter),
      world: centred(points, jitter),
    };
  });
}
