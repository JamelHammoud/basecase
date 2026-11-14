import { FACE, FACE_LANDMARK_COUNT, type FaceSample } from '../faceFollow';
import type { PoseLandmark } from '../poseLandmarks';
import { seeded } from '../../../utils/seeded';

export const FACE_FPS = 30;
export const FACE_FRAMES = 60;
export const FACE_CENTRE: [x: number, y: number] = [0.74, 0.36];

const HALF_WIDTH = 0.085;
const HALF_HEIGHT = 0.14;
const NOISE = 0.0015;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const DISTANCE_CM = 45;

const FEATURES: Record<number, [across: number, down: number]> = {
  [FACE.top]: [0, -1],
  [FACE.chin]: [0, 1],
  [FACE.rightCheek]: [-1, 0],
  [FACE.leftCheek]: [1, 0],
  1: [0, 0.05],
  13: [0, 0.45],
  14: [0, 0.5],
  33: [-0.62, -0.22],
  133: [-0.22, -0.2],
  263: [0.62, -0.22],
  362: [0.22, -0.2],
  61: [-0.3, 0.48],
  291: [0.3, 0.48],
};

function spiral(i: number): [number, number] {
  const r = Math.sqrt((i + 0.5) / FACE_LANDMARK_COUNT) * 0.95;
  const a = i * GOLDEN;

  return [r * Math.cos(a), r * Math.sin(a)];
}

function face(jitter: () => number): PoseLandmark[] {
  const [cx, cy] = FACE_CENTRE;

  return Array.from({ length: FACE_LANDMARK_COUNT }, (_, i) => {
    const [across, down] = FEATURES[i] ?? spiral(i);
    const bulge = 1 - Math.min(1, across * across + down * down);

    return {
      x: cx + across * HALF_WIDTH + jitter() * NOISE,
      y: cy + down * HALF_HEIGHT + jitter() * NOISE,
      z: -0.05 * bulge,
    };
  });
}

function facing(): number[] {
  const [cx, cy] = FACE_CENTRE;
  const across = (cx - 0.5) * DISTANCE_CM;
  const up = (0.5 - cy) * DISTANCE_CM;

  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, across, up, -DISTANCE_CM, 1];
}

export function faceOffCentre(): FaceSample[] {
  const random = seeded(478);
  const jitter = () => random() * 2 - 1;

  return Array.from({ length: FACE_FRAMES }, (_, frame) => ({
    t: Math.round((frame * 1000) / FACE_FPS),
    image: face(jitter),
    matrix: facing(),
  }));
}
