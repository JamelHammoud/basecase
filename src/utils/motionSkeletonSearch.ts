import * as THREE from 'three';
import { toScene } from '../agent/agentFrame';
import type { JointValues } from '../types/robotics';
import type { RobotSkeleton, SkeletonJoint } from '../types/skeleton';
import { forwardKinematics } from './kinematicsMotion';
import { solveIK } from './kinematicsIk';
import type { MotionAxis, MotionChain } from './motionSkeletonSource';
import { skeletonLink, skeletonRig } from './skeletonRig';

export interface FittedChain {
  joints: SkeletonJoint[];
  values: JointValues[];
  error: number;
}

function makeJoints(axes: MotionAxis[], tip: MotionChain['tip']): SkeletonJoint[] {
  return axes.map(({ joint }, index) => ({
    ...joint,
    ...(index ? { parent: axes[index - 1].joint.id } : {}),
    ...(index === axes.length - 1 ? { tip } : {}),
  }));
}

function solveChain(chain: MotionChain, axes: MotionAxis[], tolerance: number): FittedChain | undefined {
  const joints = makeJoints(axes, chain.tip);
  const skeleton: RobotSkeleton = { frame: 'z-up', joints, pairs: [] };
  const rig = skeletonRig(skeleton);
  const last = joints.at(-1);
  const values: JointValues[] = [];
  let error = 0;

  for (let frame = 0; frame < chain.targets.length; frame++) {
    const target = new THREE.Vector3(...toScene(chain.targets[frame]));

    if (!last) {
      error = Math.max(error, target.distanceTo(new THREE.Vector3(...toScene(chain.tip))));
      values.push({});
    } else {
      const seed = Object.fromEntries(axes.map((axis) => [axis.joint.id, axis.values[frame]]));
      const goal = { partId: skeletonLink(last.id), point: toScene(chain.tip), target: toScene(chain.targets[frame]) };
      const solved = solveIK(rig, seed, [goal], {
        iterations: 100,
        tolerance: Math.min(tolerance * 0.1, 0.01),
        preferWeight: 0,
      });
      const posed = forwardKinematics(rig, { values: solved.values });
      const actual = new THREE.Vector3(...toScene(chain.tip)).applyMatrix4(posed.joint.get(last.id)!);

      error = Math.max(error, actual.distanceTo(target));
      values.push(solved.values);
    }

    if (!Number.isFinite(error) || error > tolerance) return undefined;
  }

  return { joints, values, error };
}

function* subsets<T>(items: T[], count: number, start = 0, prefix: T[] = []): Generator<T[]> {
  if (!count) {
    yield prefix;

    return;
  }

  for (let index = start; index <= items.length - count; index++) {
    yield* subsets(items, count - 1, index + 1, [...prefix, items[index]]);
  }
}

export function fitMotionChain(chain: MotionChain, tolerance: number): FittedChain | undefined {
  for (let count = 0; count <= chain.axes.length; count++) {
    for (const axes of subsets(chain.axes, count)) {
      const fit = solveChain(chain, axes, tolerance);

      if (fit) return fit;
    }
  }

  return undefined;
}
