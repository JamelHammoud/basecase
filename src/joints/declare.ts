import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { anchorJoint } from '../utils/kinematics';
import type { FoundAxis } from './axisFinder';
import { actuationProblem } from './actuation';
import { mergeJoints } from './merge';

export type JointDraft = Omit<RobotJoint, 'frame'>;

export type HandJointType = 'revolute' | 'prismatic';

export const HINGE_RANGE: [number, number] = [-90, 90];

interface Sides {
  id: string;
  parent: string[];
  child: string[];
  actuation?: RobotJoint['actuation'];
  damping?: number;
  frictionloss?: number;
  actuators?: string[];
}

export function jointProblem(j: Sides, ids: Set<string>): string | null {
  const problem = actuationProblem(j);

  if (problem) return problem;

  const missing = [...j.parent, ...j.child, ...(j.actuators ?? [])].filter((id) => !ids.has(id));

  if (missing.length) return `${j.id}: no parts named ${missing.join(', ')}`;

  const both = j.parent.filter((id) => j.child.includes(id));

  return both.length ? `${j.id}: ${both.join(', ')} can’t be on both sides` : null;
}

export function jointFrom(draft: JointDraft, parts: ScenePart[]): RobotJoint {
  const problem = jointProblem(draft, new Set(parts.map((p) => p.id)));

  if (problem) throw new Error(problem);

  return anchorJoint(draft, parts);
}

export function withActuation(
  joints: RobotJoint[],
  id: string,
  actuation: NonNullable<RobotJoint['actuation']>,
): RobotJoint[] {
  return joints.map((j) =>
    j.id === id ? { ...j, actuation, ...(actuation === 'passive' ? { actuators: undefined } : {}) } : j,
  );
}

function withFirstRanges(known: ProjectSettings['firstRanges'], made: RobotJoint[]) {
  const out = { ...known };

  for (const j of made) if (j.range && !out[j.id]) out[j.id] = [Math.min(...j.range), Math.max(...j.range)];

  return out;
}

export function withJoints(
  project: ProjectSettings,
  made: RobotJoint[],
  replace = false,
): ProjectSettings & { joints: RobotJoint[] } {
  return {
    ...project,
    joints: mergeJoints(project.joints ?? [], made, replace),
    firstRanges: withFirstRanges(project.firstRanges, made),
  };
}

function freeId(type: HandJointType, joints: RobotJoint[]) {
  const stem = type === 'revolute' ? 'hinge' : 'slider';
  const taken = new Set(joints.map((j) => j.id));
  let n = 1;

  while (taken.has(`${stem}_${n}`)) n++;

  return `${stem}_${n}`;
}

export interface HandJointInput {
  type: HandJointType;
  parent: ScenePart;
  child: ScenePart;
  found: FoundAxis;
  parts: ScenePart[];
  joints: RobotJoint[];
}

export function handJoint({ type, parent, child, found, parts, joints }: HandJointInput): RobotJoint {
  return jointFrom(
    {
      id: freeId(type, joints),
      name: child.name,
      type,
      parent: [parent.id],
      child: [child.id],
      origin: found.origin,
      axis: found.axis,
      range: type === 'revolute' ? HINGE_RANGE : found.travel,
    },
    parts,
  );
}

export function withoutJoint(joints: RobotJoint[], id: string): RobotJoint[] {
  return joints.filter((j) => j.id !== id).map((j) => (j.parentJoint === id ? { ...j, parentJoint: undefined } : j));
}

export function withRange(joints: RobotJoint[], id: string, range: [number, number]): RobotJoint[] {
  return joints.map((j) => (j.id === id ? { ...j, range } : j));
}
