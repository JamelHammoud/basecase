import type { V3 } from '../../utils/kinematics';
import { distance } from './poseLandmarks';

export const FALLBACK_ARM_M = 0.55;

export type TipFollow = (frame: Readonly<Partial<Record<string, V3>>>) => V3 | null;

const minus = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function armLength(frame: Readonly<Partial<Record<string, V3>>>): number {
  const { rightShoulder, rightElbow, rightWrist } = frame;

  if (!rightShoulder || !rightElbow || !rightWrist) return FALLBACK_ARM_M;

  const length = distance(rightShoulder, rightElbow) + distance(rightElbow, rightWrist);

  return length > 0.1 ? length : FALLBACK_ARM_M;
}

export function createTipFollow(robot: { start: V3; reachMm: number }): TipFollow {
  let rest: { rel: V3; arm: number } | null = null;

  return (frame) => {
    const { rightShoulder, rightWrist } = frame;

    if (!rightShoulder || !rightWrist) return null;

    const rel = minus(rightWrist, rightShoulder);

    rest ??= { rel, arm: armLength(frame) };

    const gain = robot.reachMm / rest.arm;
    const move = minus(rel, rest.rel);

    return [robot.start[0] + move[0] * gain, robot.start[1] + move[1] * gain, robot.start[2] + move[2] * gain];
  };
}
