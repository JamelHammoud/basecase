import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { ZUpVec } from '../types/skeleton';
import { r3, toCad, toScene, type V3 } from './agentFrame';
import { placementPoint, type AgentOp, type AgentPartSpec } from './agentScene';
import type { FrameLookup } from './mate';

export interface ZUpFrame {
  origin: ZUpVec;
  axis: ZUpVec;
}

type Frames = Pick<ProjectSettings, 'skeleton' | 'joints'>;

export function zUpFrame(project: Frames, id: string): ZUpFrame | undefined {
  const planned = project.skeleton?.joints.find((j) => j.id === id);

  if (planned) return { origin: planned.origin, axis: planned.axis };

  const declared = project.joints?.find((j) => j.id === id);

  return declared ? { origin: toCad(declared.origin), axis: toCad(declared.axis) } : undefined;
}

export const frameLookup =
  (project: Frames): FrameLookup =>
  (id) => {
    const f = zUpFrame(project, id);

    return f ? { position: toScene(f.origin), axis: toScene(f.axis) } : undefined;
  };

const plus = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]].map(r3) as V3;

function inFrame(spec: AgentPartSpec, origin: ZUpVec, isAdd: boolean): AgentPartSpec {
  if (spec.position) return { ...spec, position: plus(origin, spec.position) };

  return isAdd ? { ...spec, position: [...origin] } : spec;
}

export function resolveFrames(ops: AgentOp[], project: Frames): { ops: AgentOp[]; problems: string[] } {
  const problems: string[] = [];
  const resolved = ops.flatMap((op): AgentOp[] => {
    if ((op.op !== 'add' && op.op !== 'update') || !op.part.frame) return [op];

    const f = zUpFrame(project, op.part.frame);

    if (!f) {
      problems.push(`${op.part.id}: no joint "${op.part.frame}" in the skeleton or the declared joints`);

      return [];
    }

    return [{ ...op, part: inFrame(op.part, f.origin, op.op === 'add') }];
  });

  return { ops: resolved, problems };
}

export function framedFollowOps(parts: ScenePart[], moved: Map<string, ZUpVec>): AgentOp[] {
  return parts.flatMap((p): AgentOp[] => {
    const delta = p.frame ? moved.get(p.frame) : undefined;

    if (!delta) return [];

    return [{ op: 'update', part: { id: p.id, position: plus(toCad(placementPoint(p)), delta) } }];
  });
}

export function withSkeleton(ops: AgentOp[], project: Frames): AgentOp[] {
  if (!project.skeleton) return ops;

  return ops.map((op) => (op.op === 'mirror' ? { ...op, skeleton: project.skeleton } : op));
}
