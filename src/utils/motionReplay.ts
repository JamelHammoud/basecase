import { toScene } from '../agent/agentFrame';
import type { JointValues } from '../types/robotics';
import type { RobotSkeleton, SkeletonJoint, ZUpVec } from '../types/skeleton';
import { solveIK, type IkTarget } from './kinematicsIk';
import type { CandidateAxis } from './motionAxes';
import type { MotionChain } from './motionChains';
import { skeletonLink, skeletonRig } from './skeletonRig';

export interface ChainJoint extends SkeletonJoint {
  joint: number;
}

export interface Replay {
  values: JointValues[];
  errorMm: number;
  effectorMm: number;
}

const AXIS_WORDS: Array<[number, string]> = [
  [0, 'pitch'],
  [1, 'roll'],
  [2, 'yaw'],
];

function axisWord(axis: ZUpVec): string {
  const k = [0, 1, 2].reduce((best, i) => (Math.abs(axis[i]) > Math.abs(axis[best]) ? i : best), 0);

  return AXIS_WORDS[k][1];
}

export function chainJoints(chain: MotionChain, axes: CandidateAxis[], taken: Set<string>): ChainJoint[] {
  let parent: string | undefined;

  return axes.map((a) => {
    const base = `${chain.names[a.joint]}_${axisWord(a.axis)}`;
    let n = 1;
    let id = base;

    while (taken.has(id)) id = `${base}_${++n}`;

    taken.add(id);

    const joint: ChainJoint = { id, joint: a.joint, origin: chain.rest[a.joint], axis: a.axis, limb: chain.limb };

    if (parent) joint.parent = parent;

    parent = id;

    return joint;
  });
}

function ownerOf(joints: ChainJoint[], point: number): string | null {
  const before = joints.filter((j) => j.joint < point);

  return before.length ? before[before.length - 1].id : null;
}

function targetsFor(chain: MotionChain, joints: ChainJoint[]) {
  const owners = chain.rest.map((_, i) => ownerOf(joints, i));

  return (frame: ZUpVec[]): IkTarget[] =>
    chain.rest.flatMap((rest, i) => {
      const owner = owners[i];

      return owner ? [{ partId: skeletonLink(owner), point: toScene(rest), target: toScene(frame[i]) }] : [];
    });
}

const distance = (a: ZUpVec, b: ZUpVec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function staticError(chain: MotionChain, joints: ChainJoint[]) {
  const fixed = chain.rest.map((_, i) => i).filter((i) => !ownerOf(joints, i));

  return chain.frames.map((frame) => Math.max(0, ...fixed.map((i) => distance(frame[i], chain.rest[i]))));
}

export function replayChain(chain: MotionChain, joints: ChainJoint[], toleranceMm: number): Replay | null {
  const skeleton: RobotSkeleton = { frame: 'z-up', joints, pairs: [] };
  const rig = skeletonRig(skeleton, () => undefined);
  const targets = targetsFor(chain, joints);
  const fixed = staticError(chain, joints);
  const effector = chain.rest.length - 1;
  const opts = { iterations: 40, tolerance: toleranceMm / 10, preferWeight: 0 };
  const values: JointValues[] = [];
  let errorMm = 0;
  let effectorMm = 0;
  let last: JointValues = {};

  for (const [k, frame] of chain.frames.entries()) {
    const goals = targets(frame);
    const warm = solveIK(rig, last, goals, opts);
    const solved = warm.maxError <= toleranceMm ? warm : solveIK(rig, {}, goals, opts);
    const best = solved.maxError < warm.maxError ? solved : warm;
    const error = Math.max(best.maxError, fixed[k]);

    if (error > toleranceMm) return null;

    errorMm = Math.max(errorMm, error);
    effectorMm = Math.max(effectorMm, goals.length ? best.errors[goals.length - 1] : fixed[k]);
    values.push(best.values);
    last = best.values;
  }

  return { values, errorMm, effectorMm: ownerOf(joints, effector) ? effectorMm : Math.max(0, ...fixed) };
}
