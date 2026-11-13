import type { ScenePart } from '../types/robotics';
import type { RobotSkeleton, SkeletonJoint, ZUpVec } from '../types/skeleton';
import { r3 } from './agentFrame';
import { applySpec } from './agentScene';
import { childrenOf, mirrorPoint, pairAxis } from './skeleton';
import { framedFollowOps } from './skeletonFrames';

export interface JointDrag {
  id: string;
  delta: ZUpVec;
  alone?: boolean;
}

export interface DraggedSkeleton {
  skeleton: RobotSkeleton;
  parts: ScenePart[];
  moved: Map<string, ZUpVec>;
}

const plus = (a: ZUpVec, b: ZUpVec): ZUpVec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]].map(r3) as ZUpVec;

export function subtreeOf(skeleton: RobotSkeleton, id: string): string[] {
  const out = [id];

  for (let i = 0; i < out.length; i++)
    out.push(...childrenOf(skeleton, out[i]).flatMap((c) => (out.includes(c.id) ? [] : [c.id])));

  return out;
}

function twinOf(skeleton: RobotSkeleton, id: string) {
  const pair = skeleton.pairs.find((p) => p.includes(id));

  return pair && { id: pair[0] === id ? pair[1] : pair[0], axis: pairAxis(pair) };
}

function movedJoints(skeleton: RobotSkeleton, { id, delta, alone }: JointDrag): Map<string, ZUpVec> {
  const moved = new Map<string, ZUpVec>();
  const reach = (from: string) => (alone ? [from] : subtreeOf(skeleton, from));
  const twin = twinOf(skeleton, id);

  reach(id).forEach((j) => moved.set(j, delta));

  if (twin && !moved.has(twin.id)) reach(twin.id).forEach((j) => moved.set(j, mirrorPoint(delta, twin.axis)));

  return moved;
}

function movedJoint(j: SkeletonJoint, delta: ZUpVec | undefined, alone: boolean): SkeletonJoint {
  if (!delta) return j;

  const tip = j.tip && !alone ? { tip: plus(j.tip, delta) } : {};

  return { ...j, origin: plus(j.origin, delta), ...tip };
}

function followed(parts: ScenePart[], moved: Map<string, ZUpVec>): ScenePart[] {
  const updates = new Map(
    framedFollowOps(parts, moved).flatMap((op) => (op.op === 'update' ? [[op.part.id, op.part] as const] : [])),
  );

  return parts.map((p) => {
    const spec = updates.get(p.id);

    return spec ? applySpec(p, spec) : p;
  });
}

export function dragJoint(skeleton: RobotSkeleton, parts: ScenePart[], drag: JointDrag): DraggedSkeleton {
  const moved = movedJoints(skeleton, drag);
  const joints = skeleton.joints.map((j) => movedJoint(j, moved.get(j.id), !!drag.alone));

  return { skeleton: { ...skeleton, joints }, parts: followed(parts, moved), moved };
}
