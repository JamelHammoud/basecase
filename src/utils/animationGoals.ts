import type { RobotAnimation } from '../types/robotics';
import { linkParts, type IkTarget, type Rig, type V3 } from './kinematics';

export type PointOf = (id: string, where: 'bottom' | 'center') => V3 | null;

export interface IkGoal {
  part: string;
  target: V3;
  point?: V3;
  where?: 'bottom' | 'center';
  keepOrientation?: boolean;
}

export interface BuiltAnimation {
  animation: RobotAnimation;
  notes: string[];
  ikError: Record<string, number>;
}

export const roundTo = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

export function goalParts(rig: Rig, id: string): string[] {
  if (rig.byId.has(id)) return linkParts(rig, id);

  return [id];
}

const ORIENTATION_PROBES: V3[] = [
  [0, 0, 40],
  [40, 0, 0],
  [0, 40, 0],
];

function orientationTargets(partId: string, point: V3, shift: V3): IkTarget[] {
  return ORIENTATION_PROBES.map((d) => {
    const p: V3 = [point[0] + d[0], point[1] + d[1], point[2] + d[2]];

    return { partId, point: p, target: [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]], weight: 0.35 };
  });
}

export function goalTargets(rig: Rig, goal: IkGoal, pointOf: PointOf, offset?: V3): IkTarget[] | string {
  const parts = goalParts(rig, goal.part);
  const partId = parts.find((p) => rig.ownerOf.has(p)) ?? parts[0];

  if (!partId) return `${goal.part}: no parts move with it`;

  if (!rig.ownerOf.has(partId)) return `${goal.part}: no joint moves it`;

  const point = goal.point ?? pointOf(goal.part, goal.where ?? 'center');

  if (!point) return `${goal.part}: not on the canvas`;

  const off = offset ?? [0, 0, 0];
  const out: IkTarget[] = [
    { partId, point, target: [goal.target[0] + off[0], goal.target[1] + off[1], goal.target[2] + off[2]], weight: 1 },
  ];

  if (!goal.keepOrientation) return out;

  const shift: V3 = [
    goal.target[0] - point[0] + off[0],
    goal.target[1] - point[1] + off[1],
    goal.target[2] - point[2] + off[2],
  ];

  return [...out, ...orientationTargets(partId, point, shift)];
}
