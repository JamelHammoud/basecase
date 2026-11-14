import type { InputRobot } from '../../sim/inputTypes';
import type { V3 } from '../../utils/kinematics';
import { LAPTOP_ASPECT, LAPTOP_FOCAL } from './laptopLens';
import { createKeypointSmoother, createOneEuro } from './oneEuro';
import { distance, type PoseLandmark } from './poseLandmarks';
import { FALLBACK_ARM_M } from './tipFollow';

export const HAND = {
  wrist: 0,
  thumbTip: 4,
  indexMcp: 5,
  indexTip: 8,
  middleMcp: 9,
  pinkyMcp: 17,
} as const;

export const HAND_LANDMARK_COUNT = 21;
export const HAND_PINCH_OPEN = 0.7;
export const HAND_PINCH_CLOSED = 0.25;

export interface HandSample {
  t: number;
  image: PoseLandmark[];
  world: PoseLandmark[];
}

export interface HandFollow {
  move: V3;
  target?: V3;
  grip: number;
}

export interface HandFollower {
  step: (sample: HandSample) => HandFollow | null;
}

const PALM = [HAND.indexMcp, HAND.middleMcp, HAND.pinkyMcp];
const TINY = 1e-4;

const flat = (p: PoseLandmark): V3 => [p.x * LAPTOP_ASPECT, p.y, 0];

const solid = (p: PoseLandmark): V3 => [p.x, p.y, p.z];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const minus = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const complete = (points: PoseLandmark[] | undefined): points is PoseLandmark[] =>
  !!points && points.length >= HAND_LANDMARK_COUNT && points.every((p) => Number.isFinite(p.x + p.y + p.z));

function palmSize(points: PoseLandmark[], at: (p: PoseLandmark) => V3): number {
  const wrist = at(points[HAND.wrist]);

  return PALM.reduce((sum, i) => sum + distance(wrist, at(points[i])), 0) / PALM.length;
}

export function handPosition(sample: Pick<HandSample, 'image' | 'world'>): V3 | null {
  const { image, world } = sample;

  if (!complete(image) || !complete(world)) return null;

  const imageSize = palmSize(image, flat);
  const worldSize = palmSize(world, solid);

  if (imageSize < TINY || worldSize < TINY) return null;

  const metres = worldSize / imageSize;
  const wrist = image[HAND.wrist];

  return [(wrist.x - 0.5) * LAPTOP_ASPECT * metres, -(wrist.y - 0.5) * metres, -LAPTOP_FOCAL * metres];
}

export function handPinch(world: PoseLandmark[]): number {
  if (!complete(world)) return 0;

  const size = palmSize(world, solid);

  if (size < TINY) return 0;

  const ratio = distance(solid(world[HAND.thumbTip]), solid(world[HAND.indexTip])) / size;

  return clamp01((HAND_PINCH_OPEN - ratio) / (HAND_PINCH_OPEN - HAND_PINCH_CLOSED));
}

export function createHandFollower(robot: InputRobot): HandFollower {
  const smoother = createKeypointSmoother();
  const grip = createOneEuro();
  const tip = robot.kind === 'tip' ? robot : null;
  const gain = tip ? tip.reachMm / FALLBACK_ARM_M : 0;
  let rest: V3 | null = null;

  return {
    step: (sample) => {
      const seen = handPosition(sample);

      if (!seen) return null;

      const tSeconds = sample.t / 1000;
      const { wrist } = smoother.filter({ wrist: seen }, tSeconds);

      rest ??= wrist;

      const move = minus(wrist, rest);
      const closed = clamp01(grip(handPinch(sample.world), tSeconds));

      if (!tip) return { move, grip: closed };

      const target: V3 = [0, 1, 2].map((i) => tip.start[i] + move[i] * gain) as V3;

      return { move, target, grip: closed };
    },
  };
}
