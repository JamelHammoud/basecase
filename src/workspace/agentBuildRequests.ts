import { toCad, toScene } from '../agent/agentScene';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { describeKey } from '../utils/bom';
import { anchorJoint } from '../utils/kinematics';
import type { Vec3 } from './types';

export interface JointSpec {
  id: string;
  name?: string;
  type?: RobotJoint['type'];
  parent: string[];
  child: string[];
  parent_joint?: string;
  actuators?: string[];
  origin?: Vec3;
  axis?: Vec3;
  range?: [number, number];
  limb?: RobotJoint['limb'];
}

export interface DefineJointsPayload {
  joints: JointSpec[];
  replace?: boolean;
}

export type ServoOutputOf = (id: string) => { point: Vec3; axis: Vec3 } | null | undefined;

function jointProblem(j: JointSpec, ids: Set<string>): string | null {
  const missing = [...j.parent, ...j.child, ...(j.actuators ?? [])].filter((id) => !ids.has(id));

  if (missing.length) return `${j.id}: no parts named ${missing.join(', ')}`;

  const both = j.parent.filter((id) => j.child.includes(id));

  return both.length ? `${j.id}: ${both.join(', ')} can't be on both sides` : null;
}

function makeJoint(j: JointSpec, parts: ScenePart[], servoOutput: ServoOutputOf): RobotJoint | string {
  const out = j.actuators?.length ? servoOutput(j.actuators[0]) : null;
  const origin = j.origin ? toScene(j.origin) : out?.point;
  const axis = j.axis ? toScene(j.axis) : out?.axis;

  if (!origin || !axis) return `${j.id}: give origin and axis, or an actuator to take them from`;

  return anchorJoint(
    {
      id: j.id,
      name: j.name ?? j.id,
      type: j.type ?? 'revolute',
      parent: j.parent,
      child: j.child,
      parentJoint: j.parent_joint,
      origin,
      axis,
      range: j.range,
      actuators: j.actuators,
      limb: j.limb,
    },
    parts,
  );
}

const jointLine = (j: RobotJoint, specs: JointSpec[]) =>
  `- ${j.id}: axis [${toCad(j.axis)
    .map((v) => v.toFixed(2))
    .join(', ')}] through [${toCad(j.origin)
    .map((v) => Math.round(v))
    .join(', ')}]${j.origin && !specs.find((x) => x.id === j.id)?.origin ? ' (from the servo output)' : ''}`;

export function declareJoints(
  pl: DefineJointsPayload,
  parts: ScenePart[],
  project: ProjectSettings,
  servoOutput: ServoOutputOf,
) {
  const ids = new Set(parts.map((p) => p.id));
  const problems: string[] = [];
  const made: RobotJoint[] = [];

  for (const j of pl.joints ?? []) {
    const joint = jointProblem(j, ids) ?? makeJoint(j, parts, servoOutput);

    if (typeof joint === 'string') problems.push(joint);
    else made.push(joint);
  }

  const keep = pl.replace ? [] : (project.joints ?? []).filter((j) => !made.some((m) => m.id === j.id));
  const next = { ...project, joints: [...keep, ...made] };
  const text =
    `${next.joints.length} joints declared.` +
    (made.length ? `\n${made.map((j) => jointLine(j, pl.joints)).join('\n')}` : '') +
    (problems.length ? `\nNot declared:\n- ${problems.join('\n- ')}` : '');

  return { next, text };
}

export interface BuildSettingsPayload {
  extras?: Array<{ key: string; qty: number; note?: string }>;
  budgetUsd?: number;
  material?: ProjectSettings['material'];
}

type Extra = NonNullable<ProjectSettings['extras']>[number];

function mergeExtras(
  current: Extra[] | undefined,
  changes: NonNullable<BuildSettingsPayload['extras']>,
  bad: string[],
) {
  const map = new Map((current ?? []).map((x) => [x.key, x]));

  for (const x of changes.filter((c) => !bad.includes(c.key))) {
    if (x.qty > 0) map.set(x.key, { key: x.key, qty: Math.round(x.qty), note: x.note });
    else map.delete(x.key);
  }

  return [...map.values()];
}

export function applyBuildSettings(project: ProjectSettings, pl: BuildSettingsPayload) {
  const bad = (pl.extras ?? []).filter((x) => !describeKey(x.key)).map((x) => x.key);
  const next = { ...project };

  if (pl.extras) next.extras = mergeExtras(next.extras, pl.extras, bad);

  if (pl.budgetUsd !== undefined) next.budgetUsd = pl.budgetUsd > 0 ? pl.budgetUsd : undefined;

  if (pl.material) next.material = pl.material;

  return { next, bad };
}
