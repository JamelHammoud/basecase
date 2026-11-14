import type { V3 } from '../../../utils/kinematics';
import type { PoseSample } from '../../operator/poseFollow';
import { POSE, POSE_LANDMARK_COUNT, type PoseLandmark } from '../../operator/poseLandmarks';

export const BODY_FPS = 30;

export type Hand = 'relaxed' | 'palm' | 'thumb-up';

export interface Arm {
  upper: V3;
  fore: V3;
  hand?: Hand;
}

export interface BodyPose {
  left: Arm;
  right: Arm;
  pitchDeg?: number;
  yawDeg?: number;
  at?: V3;
  facingDeg?: number;
}

export interface Person {
  scale: number;
  noiseM: number;
  seed: number;
}

export const ADULT: Person = { scale: 1, noiseM: 0.0025, seed: 370 };

const SHOULDER_HALF = 0.18;
const UPPER_ARM = 0.29;
const FOREARM = 0.26;
const SHOULDER_Y = 0.5;
const HEAD_Y = 0.67;

type Body = Partial<Record<keyof typeof POSE, V3>>;

const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

const scaled = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];

const unit = (a: V3): V3 => scaled(a, 1 / (Math.hypot(...a) || 1));

export const direction = (x: number, y: number, z: number): V3 => unit([x, y, z]);

export const HANGING: Arm = { upper: direction(0.1, -1, 0), fore: direction(0.05, -1, 0.15) };

export const mirror = (arm: Arm): Arm => ({
  ...arm,
  upper: [-arm.upper[0], arm.upper[1], arm.upper[2]],
  fore: [-arm.fore[0], arm.fore[1], arm.fore[2]],
});

function handPoints(wrist: V3, along: V3, outward: number): [index: V3, pinky: V3, thumb: V3] {
  const side: V3 = [outward, 0, 0];

  return [
    add(wrist, along, 0.085),
    add(add(wrist, along, 0.075), side, 0.03),
    add(add(wrist, along, 0.05), side, -0.035),
  ];
}

function fist(wrist: V3, along: V3, outward: number): [index: V3, pinky: V3, thumb: V3] {
  const knuckles = add(wrist, along, 0.06);

  return [
    knuckles,
    add(add(knuckles, [0, -0.03, 0]), [outward, 0, 0], 0.005),
    add(add(wrist, along, 0.03), [0, 1, 0], 0.07),
  ];
}

function arm(side: 'left' | 'right', { upper, fore, hand = 'relaxed' }: Arm): Body {
  const outward = side === 'left' ? 1 : -1;
  const shoulder: V3 = [SHOULDER_HALF * outward, SHOULDER_Y, 0];
  const elbow = add(shoulder, unit(upper), UPPER_ARM);
  const wrist = add(elbow, unit(fore), FOREARM);
  const [index, pinky, thumb] =
    hand === 'thumb-up' ? fist(wrist, unit(fore), outward) : handPoints(wrist, unit(fore), outward);

  return {
    [`${side}Shoulder`]: shoulder,
    [`${side}Elbow`]: elbow,
    [`${side}Wrist`]: wrist,
    [`${side}Index`]: index,
    [`${side}Pinky`]: pinky,
    [`${side}Thumb`]: thumb,
  };
}

function turned(p: V3, { pitchDeg = 0, yawDeg = 0 }: { pitchDeg?: number; yawDeg?: number }): V3 {
  const pitch = (pitchDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const y = p[1] * Math.cos(pitch) - p[2] * Math.sin(pitch);
  const z = p[1] * Math.sin(pitch) + p[2] * Math.cos(pitch);

  return [p[0] * Math.cos(yaw) + z * Math.sin(yaw), y, -p[0] * Math.sin(yaw) + z * Math.cos(yaw)];
}

function head(pose: BodyPose): Body {
  const local: Body = {
    nose: [0, -0.01, 0.1],
    leftEyeInner: [0.015, 0.02, 0.085],
    leftEye: [0.032, 0.025, 0.08],
    leftEyeOuter: [0.048, 0.02, 0.07],
    rightEyeInner: [-0.015, 0.02, 0.085],
    rightEye: [-0.032, 0.025, 0.08],
    rightEyeOuter: [-0.048, 0.02, 0.07],
    leftEar: [0.075, 0, 0],
    rightEar: [-0.075, 0, 0],
    mouthLeft: [0.025, -0.05, 0.085],
    mouthRight: [-0.025, -0.05, 0.085],
  };

  return Object.fromEntries(
    Object.entries(local).map(([name, p]) => [name, add([0, HEAD_Y, 0], turned(p, pose))]),
  ) as Body;
}

const LEGS: Body = {
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

export function seeded(seed: number) {
  let s = seed >>> 0;

  return () => {
    s = (s + 0x6d2b79f5) >>> 0;

    let t = s;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function placed(p: V3, pose: BodyPose, person: Person): V3 {
  const facing = turned(scaled(p, person.scale), { yawDeg: pose.facingDeg ?? 0 });

  return add(facing, pose.at ?? [0, 0, 0]);
}

export function bodyLandmarks(pose: BodyPose, person: Person, random: () => number): PoseLandmark[] {
  const body: Body = { ...head(pose), ...LEGS, ...arm('left', pose.left), ...arm('right', pose.right) };
  const jitter = () => (random() * 2 - 1) * person.noiseM;
  const out: PoseLandmark[] = [];

  for (const [name, index] of Object.entries(POSE)) {
    const p = placed(body[name as keyof typeof POSE] ?? [0, 0, 0], pose, person);

    out[index] = { x: p[0] + jitter(), y: -(p[1] + jitter()), z: -(p[2] + jitter()), visibility: 0.95 };
  }

  return out.slice(0, POSE_LANDMARK_COUNT);
}

export function motion(seconds: number, at: (t: number) => BodyPose, person: Person = ADULT): PoseSample[] {
  const random = seeded(person.seed);
  const frames = Math.round(seconds * BODY_FPS);

  return Array.from({ length: frames }, (_, frame) => {
    const t = frame / BODY_FPS;

    return { t: Math.round(t * 1000), world: bodyLandmarks(at(t), person, random) };
  });
}

const smooth = (u: number) => {
  const c = Math.min(1, Math.max(0, u));

  return c * c * (3 - 2 * c);
};

const mix = (a: V3, b: V3, u: number): V3 =>
  unit([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);

export const blendArm = (a: Arm, b: Arm, u: number): Arm => ({
  upper: mix(a.upper, b.upper, smooth(u)),
  fore: mix(a.fore, b.fore, smooth(u)),
  hand: smooth(u) < 0.5 ? a.hand : b.hand,
});

export interface Phase {
  seconds: number;
  pose: (t: number) => BodyPose;
}

export function phases(list: Phase[]): { seconds: number; at: (t: number) => BodyPose } {
  const seconds = list.reduce((sum, p) => sum + p.seconds, 0);

  return {
    seconds,
    at: (t) => {
      let start = 0;

      for (const phase of list) {
        if (t < start + phase.seconds) return phase.pose(t - start);

        start += phase.seconds;
      }

      const last = list[list.length - 1];

      return last.pose(last.seconds);
    },
  };
}

export const still = (seconds: number, pose: BodyPose = { left: HANGING, right: mirror(HANGING) }): Phase => ({
  seconds,
  pose: () => pose,
});

export function move(seconds: number, from: BodyPose, to: BodyPose): Phase {
  return {
    seconds,
    pose: (t) => ({
      ...to,
      left: blendArm(from.left, to.left, t / seconds),
      right: blendArm(from.right, to.right, t / seconds),
      pitchDeg: (from.pitchDeg ?? 0) + ((to.pitchDeg ?? 0) - (from.pitchDeg ?? 0)) * smooth(t / seconds),
      yawDeg: (from.yawDeg ?? 0) + ((to.yawDeg ?? 0) - (from.yawDeg ?? 0)) * smooth(t / seconds),
    }),
  };
}
