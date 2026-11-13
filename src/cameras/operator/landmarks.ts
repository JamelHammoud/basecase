import type { V3 } from '../../utils/kinematics';
import type { Keypoint } from '../../utils/mocapBones';

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type LandmarkRow = [number, number, number, number];

export const LANDMARK_COUNT = 33;

export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftFoot: 31,
  rightFoot: 32,
} as const;

export const BONES: ReadonlyArray<[number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [15, 19],
  [15, 21],
  [16, 20],
  [16, 22],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 31],
  [28, 32],
];

const SINGLE: Partial<Record<Keypoint, number>> = {
  leftShoulder: LM.leftShoulder,
  rightShoulder: LM.rightShoulder,
  leftElbow: LM.leftElbow,
  rightElbow: LM.rightElbow,
  leftWrist: LM.leftWrist,
  rightWrist: LM.rightWrist,
  leftHip: LM.leftHip,
  rightHip: LM.rightHip,
};

const ARMS = new Set<Keypoint>(['leftElbow', 'leftWrist', 'rightElbow', 'rightWrist']);

const SEEN = 0.5;

export const fromRows = (rows: readonly LandmarkRow[]): PoseLandmark[] =>
  rows.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));

export const upOf = (p: PoseLandmark): V3 => [p.x, -p.y, -p.z];

const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

export const distance = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function upperFrame(lm: readonly PoseLandmark[], everyArm: boolean): Partial<Record<Keypoint, V3>> {
  const at = (i: number) => upOf(lm[i]);
  const frame: Partial<Record<Keypoint, V3>> = {};

  for (const [key, i] of Object.entries(SINGLE) as Array<[Keypoint, number]>) {
    if (everyArm || !ARMS.has(key) || (lm[i].visibility ?? 1) >= SEEN) frame[key] = at(i);
  }

  const chest = mid(at(LM.leftShoulder), at(LM.rightShoulder));

  frame.hips = mid(at(LM.leftHip), at(LM.rightHip));
  frame.chest = chest;
  frame.neck = chest;
  frame.head = mid(at(LM.leftEar), at(LM.rightEar));

  return frame;
}

const PINCH_OPEN = 0.7;
const PINCH_SHUT = 0.25;

export function pinch(lm: readonly PoseLandmark[]): number {
  const thumb = upOf(lm[LM.leftThumb]);
  const index = upOf(lm[LM.leftIndex]);
  const hand = distance(upOf(lm[LM.leftWrist]), index);

  if (hand < 1e-4) return 0;

  const ratio = distance(thumb, index) / hand;

  return Math.max(0, Math.min(1, (PINCH_OPEN - ratio) / (PINCH_OPEN - PINCH_SHUT)));
}

export function elbowBend(lm: readonly PoseLandmark[], side: 'left' | 'right'): number {
  const [s, e, w] = (['Shoulder', 'Elbow', 'Wrist'] as const).map((k) => upOf(lm[LM[`${side}${k}`]]));
  const a = [e[0] - s[0], e[1] - s[1], e[2] - s[2]];
  const b = [w[0] - e[0], w[1] - e[1], w[2] - e[2]];
  const cos = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b));

  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}
