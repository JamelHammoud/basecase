import type { V3 } from '../../utils/kinematics';

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export const POSE = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
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
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export const POSE_LANDMARK_COUNT = 33;

export const MIN_VISIBILITY = 0.5;

const LIMBS = {
  leftElbow: POSE.leftElbow,
  rightElbow: POSE.rightElbow,
  leftWrist: POSE.leftWrist,
  rightWrist: POSE.rightWrist,
  leftKnee: POSE.leftKnee,
  rightKnee: POSE.rightKnee,
  leftAnkle: POSE.leftAnkle,
  rightAnkle: POSE.rightAnkle,
  leftToe: POSE.leftFootIndex,
  rightToe: POSE.rightFootIndex,
} as const;

export const toHuman = (p: PoseLandmark): V3 => [p.x, -p.y, -p.z];

export const isSeen = (p: PoseLandmark | undefined): p is PoseLandmark =>
  !!p && (p.visibility ?? 1) >= MIN_VISIBILITY && Number.isFinite(p.x + p.y + p.z);

const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

const lerp = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const distance = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function core(world: PoseLandmark[]): Record<string, V3> | null {
  const at = (i: number) => (world[i] ? toHuman(world[i]) : null);
  const leftShoulder = at(POSE.leftShoulder);
  const rightShoulder = at(POSE.rightShoulder);
  const leftHip = at(POSE.leftHip);
  const rightHip = at(POSE.rightHip);

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const hips = mid(leftHip, rightHip);
  const neck = mid(leftShoulder, rightShoulder);

  return { hips, chest: lerp(hips, neck, 0.75), neck, leftShoulder, rightShoulder, leftHip, rightHip };
}

export function humanFrame(world: PoseLandmark[]): Record<string, V3> {
  const frame = core(world);

  if (!frame) return {};

  for (const [key, index] of Object.entries(LIMBS)) {
    const p = world[index];

    if (isSeen(p)) frame[key] = toHuman(p);
  }

  const leftEar = world[POSE.leftEar];
  const rightEar = world[POSE.rightEar];

  if (isSeen(leftEar) && isSeen(rightEar)) frame.head = mid(toHuman(leftEar), toHuman(rightEar));

  return frame;
}

export const PINCH_OPEN = 0.65;
export const PINCH_CLOSED = 0.3;

export function pinch(world: PoseLandmark[]): number {
  const hand = [POSE.leftWrist, POSE.leftPinky, POSE.leftIndex, POSE.leftThumb].map((i) => world[i]);

  if (!hand.every(isSeen)) return 0;

  const [wrist, pinky, index, thumb] = hand.map((p) => toHuman(p!));
  const size = (distance(wrist, index) + distance(wrist, pinky)) / 2;

  if (size < 1e-4) return 0;

  const ratio = distance(thumb, index) / size;

  return Math.min(1, Math.max(0, (PINCH_OPEN - ratio) / (PINCH_OPEN - PINCH_CLOSED)));
}
