import type { JointValues } from '../types/robotics';
import type { IkTarget, V3 } from '../utils/kinematics';

export interface ArmGrip {
  jaws: Array<{ joint: string; open: number; closed: number }>;
  approach: V3;
  across: V3;
  palmMm: number;
}

export const HOLD_WEIGHT = 0.05;

const MIN_REACH_MM = 1;

const along = (from: V3, dir: V3, length: number): V3 => from.map((x, i) => x + dir[i] * length) as V3;

export function gripValues(grip: Pick<ArmGrip, 'jaws'>, amount: number, start: JointValues): JointValues {
  const share = Math.max(0, Math.min(1, amount));

  return Object.fromEntries(
    grip.jaws.map(({ joint, open, closed }) => {
      const from = start[joint] ?? open;

      return [joint, from + (closed - from) * share];
    }),
  );
}

export function restSide(grip: ArmGrip): V3 {
  const [x, , z] = grip.across;
  const length = Math.hypot(x, z);

  return length < 1e-6 ? [1, 0, 0] : [x / length, 0, z / length];
}

export function sideFor(goal: V3, anchor: V3, previous: V3): V3 {
  const dx = goal[0] - anchor[0];
  const dz = goal[2] - anchor[2];
  const length = Math.hypot(dx, dz);

  if (length < MIN_REACH_MM) return previous;

  const side: V3 = [dz / length, 0, -dx / length];

  return side[0] * previous[0] + side[2] * previous[2] >= 0 ? side : [-side[0], 0, -side[2]];
}

export interface HoldInput {
  grip: ArmGrip;
  part: string;
  point: V3;
  goal: V3;
  side: V3;
}

export function topDownTargets({ grip, part, point, goal, side }: HoldInput): IkTarget[] {
  const { approach, across, palmMm } = grip;

  return [
    {
      partId: part,
      point: along(point, approach, -palmMm),
      target: along(goal, [0, 1, 0], palmMm),
      weight: HOLD_WEIGHT,
    },
    { partId: part, point: along(point, across, palmMm), target: along(goal, side, palmMm), weight: HOLD_WEIGHT },
  ];
}
