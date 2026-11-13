import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { buildJoint, jointProblem, withJoints, type SceneAxis } from './declareJoints';

export type HandJointType = 'revolute' | 'prismatic';

export const HINGE_RANGE: [number, number] = [-90, 90];

export interface HandJointOptions {
  type: HandJointType;
  parent: string;
  child: string;
  at: SceneAxis;
  range: [number, number];
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'joint';

export function uniqueJointId(joints: RobotJoint[] | undefined, name: string): string {
  const taken = new Set((joints ?? []).map((j) => j.id));
  const base = slug(name);
  let n = 1;

  while (taken.has(n === 1 ? base : `${base}_${n}`)) n++;

  return n === 1 ? base : `${base}_${n}`;
}

export function addHandJoint(
  { type, parent, child, at, range }: HandJointOptions,
  parts: ScenePart[],
  project: ProjectSettings,
): { next: ProjectSettings; joint: RobotJoint } | string {
  const name = parts.find((p) => p.id === child)?.name ?? child;
  const spec = { id: uniqueJointId(project.joints, name), name, type, parent: [parent], child: [child], range };
  const problem = jointProblem(spec, new Set(parts.map((p) => p.id)));

  if (problem) return problem;

  const joint = buildJoint(spec, at, parts);

  return { next: withJoints(project, [joint]), joint };
}

export function withoutJoint(project: ProjectSettings, id: string): ProjectSettings {
  const joints = (project.joints ?? [])
    .filter((j) => j.id !== id)
    .map((j) => (j.parentJoint === id ? { ...j, parentJoint: undefined } : j));
  const firstRanges = Object.fromEntries(Object.entries(project.firstRanges ?? {}).filter(([j]) => j !== id));

  return { ...project, joints, firstRanges };
}

export function withJointRange(project: ProjectSettings, id: string, range: [number, number]): ProjectSettings {
  const sorted: [number, number] = [Math.min(...range), Math.max(...range)];

  return {
    ...project,
    joints: (project.joints ?? []).map((j) => (j.id === id ? { ...j, range: sorted } : j)),
    firstRanges: { ...project.firstRanges, [id]: sorted },
  };
}

export function shownRange(joint: RobotJoint): [number, number] {
  if (joint.range) return [Math.min(...joint.range), Math.max(...joint.range)];

  return joint.type === 'prismatic' ? [-100, 100] : [-180, 180];
}
