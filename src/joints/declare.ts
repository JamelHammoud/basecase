import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { anchorJoint } from '../utils/kinematics';
import type { FoundAxis } from './axisFinder';

export type JointDraft = Omit<RobotJoint, 'frame'>;

export type HandJointType = 'revolute' | 'prismatic';

export const HINGE_RANGE: [number, number] = [-90, 90];

interface Sides {
  id: string;
  parent: string[];
  child: string[];
  actuators?: string[];
}

export function jointProblem(j: Sides, ids: Set<string>): string | null {
  const missing = [...j.parent, ...j.child, ...(j.actuators ?? [])].filter((id) => !ids.has(id));

  if (missing.length) return `${j.id}: no parts named ${missing.join(', ')}`;

  const both = j.parent.filter((id) => j.child.includes(id));

  return both.length ? `${j.id}: ${both.join(', ')} can't be on both sides` : null;
}

export const jointFrom = (draft: JointDraft, parts: ScenePart[]): RobotJoint => anchorJoint(draft, parts);

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
  const keep = replace ? [] : (project.joints ?? []).filter((j) => !made.some((m) => m.id === j.id));

  return { ...project, joints: [...keep, ...made], firstRanges: withFirstRanges(project.firstRanges, made) };
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
