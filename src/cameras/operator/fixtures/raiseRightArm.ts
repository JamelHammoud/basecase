import type { V3 } from '../../../utils/kinematics';
import type { PoseSample } from '../poseFollow';
import { POSE, POSE_LANDMARK_COUNT, toHuman, type PoseLandmark } from '../poseLandmarks';
import { seeded } from '../../../utils/seeded';

export const RAISE_FPS = 30;
export const UPPER_ARM_M = 0.29;
export const FOREARM_M = 0.26;
export const SHOULDER_WIDTH_M = 0.36;

const STILL = 20;
const RAISE = 30;
const HOLD = 15;
const BEND = 30;
const END = 25;
const PINCH_FROM = 80;
const PINCH_FRAMES = 20;
const NOISE_M = 0.0025;
const RAISE_DEG = 88;
const BEND_DEG = 90;

export const RAISE_FRAMES = STILL + RAISE + HOLD + BEND + END;
export const RAISED_AT = STILL + RAISE + HOLD - 1;

type Body = Partial<Record<keyof typeof POSE, V3>>;

const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

const smooth = (u: number) => {
  const c = Math.min(1, Math.max(0, u));

  return c * c * (3 - 2 * c);
};

const ramp = (frame: number, from: number, frames: number) => smooth((frame - from) / frames);

export function armAngles(frame: number) {
  return {
    raise: RAISE_DEG * ramp(frame, STILL, RAISE),
    bend: BEND_DEG * ramp(frame, STILL + RAISE + HOLD, BEND),
    pinch: ramp(frame, PINCH_FROM, PINCH_FRAMES),
  };
}

const swing = (deg: number): V3 => {
  const r = (deg * Math.PI) / 180;

  return [0, -Math.cos(r), Math.sin(r)];
};

function head(): Body {
  return {
    nose: [0, 0.66, 0.1],
    leftEyeInner: [0.015, 0.69, 0.085],
    leftEye: [0.032, 0.695, 0.08],
    leftEyeOuter: [0.048, 0.69, 0.07],
    rightEyeInner: [-0.015, 0.69, 0.085],
    rightEye: [-0.032, 0.695, 0.08],
    rightEyeOuter: [-0.048, 0.69, 0.07],
    leftEar: [0.075, 0.67, 0],
    rightEar: [-0.075, 0.67, 0],
    mouthLeft: [0.025, 0.62, 0.085],
    mouthRight: [-0.025, 0.62, 0.085],
  };
}

function legs(): Body {
  return {
    leftHip: [0.09, 0, 0],
    rightHip: [-0.09, 0, 0],
    leftKnee: [0.095, -0.44, 0.02],
    rightKnee: [-0.095, -0.44, 0.02],
    leftAnkle: [0.1, -0.86, 0],
    rightAnkle: [-0.1, -0.86, 0],
    leftHeel: [0.1, -0.91, -0.04],
    rightHeel: [-0.1, -0.91, -0.04],
    leftFootIndex: [0.11, -0.93, 0.15],
    rightFootIndex: [-0.11, -0.93, 0.15],
  };
}

function leftArm(pinching: number): Body {
  const shoulder: V3 = [SHOULDER_WIDTH_M / 2, 0.5, 0];
  const elbow = add(shoulder, [0.01, -1, 0], UPPER_ARM_M);
  const wrist = add(elbow, [0.01, -1, 0.05], FOREARM_M);
  const index = add(wrist, [0, -0.085, 0.03]);
  const open = add(wrist, [-0.01, -0.04, 0.09]);
  const closed = add(index, [-0.008, 0.01, 0.006]);

  return {
    leftShoulder: shoulder,
    leftElbow: elbow,
    leftWrist: wrist,
    leftIndex: index,
    leftPinky: add(wrist, [0, -0.075, -0.02]),
    leftThumb: [0, 1, 2].map((i) => open[i] + (closed[i] - open[i]) * pinching) as V3,
  };
}

function rightArm(raise: number, bend: number): Body {
  const shoulder: V3 = [-SHOULDER_WIDTH_M / 2, 0.5, 0];
  const elbow = add(shoulder, swing(raise), UPPER_ARM_M);
  const along = swing(raise + bend);
  const wrist = add(elbow, along, FOREARM_M);

  return {
    rightShoulder: shoulder,
    rightElbow: elbow,
    rightWrist: wrist,
    rightIndex: add(add(wrist, along, 0.085), [0.015, 0, 0]),
    rightPinky: add(add(wrist, along, 0.075), [-0.03, 0, 0]),
    rightThumb: add(add(wrist, along, 0.05), [0.04, 0, 0.02]),
  };
}

function landmarks(body: Body, random: () => number): PoseLandmark[] {
  const out: PoseLandmark[] = [];
  const jitter = () => (random() * 2 - 1) * NOISE_M;

  for (const [name, index] of Object.entries(POSE)) {
    const p = body[name as keyof typeof POSE] ?? [0, 0, 0];

    out[index] = {
      x: p[0] + jitter(),
      y: -(p[1] + jitter()),
      z: -(p[2] + jitter()),
      visibility: 0.95 + random() * 0.04,
    };
  }

  return out.slice(0, POSE_LANDMARK_COUNT);
}

const toImage = (world: PoseLandmark[]): PoseLandmark[] =>
  world.map((p) => ({ x: 0.5 + p.x * 0.45, y: 0.55 + p.y * 0.45, z: p.z, visibility: p.visibility }));

export function raiseRightArm(): PoseSample[] {
  const random = seeded(186);

  return Array.from({ length: RAISE_FRAMES }, (_, frame) => {
    const { raise, bend, pinch } = armAngles(frame);
    const body = { ...head(), ...legs(), ...leftArm(pinch), ...rightArm(raise, bend) };
    const world = landmarks(body, random);

    return { t: Math.round((frame * 1000) / RAISE_FPS), world, image: toImage(world) };
  });
}

export function elbowFlexion(world: PoseLandmark[], side: 'left' | 'right' = 'right'): number {
  const [s, e, w] = (
    side === 'right'
      ? [POSE.rightShoulder, POSE.rightElbow, POSE.rightWrist]
      : [POSE.leftShoulder, POSE.leftElbow, POSE.leftWrist]
  ).map((i) => toHuman(world[i]));
  const upper = [e[0] - s[0], e[1] - s[1], e[2] - s[2]];
  const fore = [w[0] - e[0], w[1] - e[1], w[2] - e[2]];
  const dot = upper[0] * fore[0] + upper[1] * fore[1] + upper[2] * fore[2];
  const cos = dot / (Math.hypot(...upper) * Math.hypot(...fore));

  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}
