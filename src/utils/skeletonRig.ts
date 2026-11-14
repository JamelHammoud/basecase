import { toScene } from '../agent/agentFrame';
import type { JointValues, RobotJoint } from '../types/robotics';
import type { RobotSkeleton, SkeletonJoint, ZUpVec } from '../types/skeleton';
import { solveIK } from './kinematicsIk';
import { buildRig, type Rig } from './kinematicsRig';

export const skeletonLink = (id: string) => `${id}:link`;

const BASE = 'skeleton:base';

function rigJoint(j: SkeletonJoint, range: (j: SkeletonJoint) => [number, number] | undefined): RobotJoint {
  const limits = range(j);

  return {
    id: j.id,
    name: j.name ?? j.id,
    type: j.type ?? 'revolute',
    parent: [j.parent ? skeletonLink(j.parent) : BASE],
    child: [skeletonLink(j.id)],
    ...(j.parent ? { parentJoint: j.parent } : {}),
    origin: toScene(j.origin),
    axis: toScene(j.axis),
    ...(limits ? { range: limits } : {}),
    ...(j.limb ? { limb: j.limb } : {}),
  };
}

export function skeletonRig(
  skeleton: RobotSkeleton,
  range: (j: SkeletonJoint) => [number, number] | undefined = (j) => j.range,
): Rig {
  return buildRig(
    skeleton.joints.map((j) => rigJoint(j, range)),
    [],
  );
}

export interface TipReach {
  values: JointValues;
  errorMm: number;
}

export function reachWithTip(rig: Rig, tip: { joint: string; point: ZUpVec }, at: ZUpVec, seed: JointValues): TipReach {
  const solved = solveIK(
    rig,
    seed,
    [{ partId: skeletonLink(tip.joint), point: toScene(tip.point), target: toScene(at) }],
    {
      iterations: 60,
      tolerance: 0.2,
      preferWeight: 0,
    },
  );

  return { values: solved.values, errorMm: solved.maxError };
}
