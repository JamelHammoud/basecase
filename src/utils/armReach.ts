import type { JointValues, RobotJoint } from '../types/robotics';
import type { RobotSkeleton, SkeletonJoint, ZUpVec } from '../types/skeleton';
import { toScene } from '../agent/agentFrame';
import { solveIK } from './kinematicsIk';
import { buildRig, type Rig } from './kinematicsRig';

export const REACH_MM = 2;
export const RANGE_MARGIN = 0.1;

export interface TargetReach {
  values: JointValues;
  errorMm: number;
}

const SEED_BENDS: Array<[number, number, number]> = [
  [30, -60, -30],
  [60, -90, 0],
  [0, 0, 0],
  [-30, 60, 30],
  [70, -30, -60],
  [-60, 90, 0],
];

export function innerRange(range: [number, number], margin = RANGE_MARGIN): [number, number] {
  const lo = Math.min(...range);
  const hi = Math.max(...range);
  const pad = (hi - lo) * margin;

  return [lo + pad, hi - pad];
}

const linkOf = (id: string) => `link:${id}`;

function rigJoint(j: SkeletonJoint, margin: number): RobotJoint {
  return {
    id: j.id,
    name: j.name ?? j.id,
    type: j.type ?? 'revolute',
    parent: [linkOf(j.parent ?? 'base')],
    child: [linkOf(j.id)],
    ...(j.parent ? { parentJoint: j.parent } : {}),
    origin: toScene(j.origin),
    axis: toScene(j.axis),
    ...(j.range ? { range: innerRange(j.range, margin) } : {}),
  };
}

export function armTip(skeleton: RobotSkeleton): SkeletonJoint | undefined {
  return skeleton.joints.find((j) => j.tip && !skeleton.joints.some((k) => k.parent === j.id));
}

export function skeletonRig(skeleton: RobotSkeleton, margin = RANGE_MARGIN): Rig {
  return buildRig(
    skeleton.joints.map((j) => rigJoint(j, margin)),
    [],
  );
}

function yawSeed(skeleton: RobotSkeleton, target: ZUpVec): number {
  const [root, next] = skeleton.joints;
  const rest = next ? [next.origin[0] - root.origin[0], next.origin[1] - root.origin[1]] : [0, -1];
  const want = [target[0] - root.origin[0], target[1] - root.origin[1]];
  const turn = Math.atan2(rest[0] * want[1] - rest[1] * want[0], rest[0] * want[0] + rest[1] * want[1]);

  return ((turn * 180) / Math.PI) * Math.sign(root.axis[2] || 1);
}

function seedsFor(skeleton: RobotSkeleton, target: ZUpVec): JointValues[] {
  const ids = skeleton.joints.map((j) => j.id);
  const yaw = yawSeed(skeleton, target);

  return SEED_BENDS.map((bends) => Object.fromEntries(ids.map((id, i) => [id, i === 0 ? yaw : (bends[i - 1] ?? 0)])));
}

export function reachTarget(skeleton: RobotSkeleton, target: ZUpVec, seed?: JointValues): TargetReach {
  const tip = armTip(skeleton);

  if (!tip?.tip) return { values: {}, errorMm: Infinity };

  const rig = skeletonRig(skeleton);
  const goal = [{ partId: linkOf(tip.id), point: toScene(tip.tip), target: toScene(target) }];
  let best: TargetReach = { values: {}, errorMm: Infinity };

  for (const start of [...(seed ? [seed] : []), ...seedsFor(skeleton, target)]) {
    const solved = solveIK(rig, start, goal, { tolerance: 0.05, iterations: 80, preferWeight: 0 });

    if (solved.maxError < best.errorMm) best = { values: solved.values, errorMm: solved.maxError };

    if (best.errorMm <= REACH_MM / 4) break;
  }

  return best;
}

export function reachTargets(skeleton: RobotSkeleton, targets: ZUpVec[], seeds?: JointValues[]): TargetReach[] {
  return targets.map((t, i) => reachTarget(skeleton, t, seeds?.[i]));
}
