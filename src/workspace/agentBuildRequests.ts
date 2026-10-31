import { toCad, toScene } from '../agent/agentScene';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import type { SkeletonJoint } from '../types/skeleton';
import { dot, lineDistance, norm } from '../utils/engineeringMath';
import { describeKey } from '../utils/bom';
import type { Money } from '../utils/currency';
import { currentMoney } from '../utils/currencyStore';
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

function seeded(j: JointSpec, planned: SkeletonJoint | undefined): JointSpec {
  if (!planned) return j;

  return {
    ...j,
    name: j.name ?? planned.name,
    type: j.type ?? planned.type,
    range: j.range ?? planned.range,
    limb: j.limb ?? planned.limb,
  };
}

function makeJoint(j: JointSpec, parts: ScenePart[], servoOutput: ServoOutputOf, planned?: SkeletonJoint) {
  const out = j.actuators?.length ? servoOutput(j.actuators[0]) : null;
  const origin = j.origin ? toScene(j.origin) : (out?.point ?? (planned && toScene(planned.origin)));
  const axis = j.axis ? toScene(j.axis) : (out?.axis ?? (planned && toScene(planned.axis)));

  if (!origin || !axis) return `${j.id}: give origin and axis, an actuator, or a skeleton joint to take them from`;

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

function sourceOf(j: RobotJoint, spec: JointSpec | undefined, planned: SkeletonJoint | undefined) {
  if (spec?.origin) return '';

  if (j.actuators?.length) return ' (from the servo output)';

  return planned ? ' (from the skeleton)' : '';
}

const jointLine = (j: RobotJoint, specs: JointSpec[], project: ProjectSettings) =>
  `- ${j.id}: axis [${toCad(j.axis)
    .map((v) => v.toFixed(2))
    .join(', ')}] through [${toCad(j.origin)
    .map((v) => Math.round(v))
    .join(', ')}]${sourceOf(
    j,
    specs.find((x) => x.id === j.id),
    plannedJoint(project, j.id),
  )}`;

const plannedJoint = (project: ProjectSettings, id: string) => project.skeleton?.joints.find((k) => k.id === id);

const DRIFT_MM = 0.5;
const DRIFT_COS = Math.cos(Math.PI / 180);

function skeletonDrift(j: RobotJoint, planned: SkeletonJoint | undefined): string | null {
  if (!planned) return null;

  const o = toCad(j.origin);
  const a = toCad(j.axis);
  const off = lineDistance(o, planned.origin, norm(planned.axis));
  const parallel = Math.abs(dot(norm(a), norm(planned.axis))) >= DRIFT_COS;

  if (off <= DRIFT_MM && parallel) return null;

  return `${j.id}: ${parallel ? '' : 'not parallel to and '}${Math.round(off * 10) / 10} mm off the skeleton axis; move the parts or update define_skeleton`;
}

function withFirstRanges(known: ProjectSettings['firstRanges'], made: RobotJoint[]) {
  const out = { ...known };

  for (const j of made) if (j.range && !out[j.id]) out[j.id] = [Math.min(...j.range), Math.max(...j.range)];

  return out;
}

export function declareJoints(
  pl: DefineJointsPayload,
  parts: ScenePart[],
  project: ProjectSettings,
  servoOutput: ServoOutputOf,
) {
  const ids = new Set(parts.map((p) => p.id));
  const problems: string[] = [];
  const made: RobotJoint[] = [];

  for (const raw of pl.joints ?? []) {
    const planned = plannedJoint(project, raw.id);
    const j = seeded(raw, planned);
    const joint = jointProblem(j, ids) ?? makeJoint(j, parts, servoOutput, planned);

    if (typeof joint === 'string') problems.push(joint);
    else made.push(joint);
  }

  const drift = made.map((m) => skeletonDrift(m, plannedJoint(project, m.id))).filter((x): x is string => !!x);

  const keep = pl.replace ? [] : (project.joints ?? []).filter((j) => !made.some((m) => m.id === j.id));
  const next = { ...project, joints: [...keep, ...made], firstRanges: withFirstRanges(project.firstRanges, made) };
  const text =
    `${next.joints.length} joints declared.` +
    (made.length ? `\n${made.map((j) => jointLine(j, pl.joints, project)).join('\n')}` : '') +
    (problems.length ? `\nNot declared:\n- ${problems.join('\n- ')}` : '') +
    (drift.length ? `\nOff the skeleton:\n- ${drift.join('\n- ')}` : '');

  return { next, text };
}

export interface BuildSettingsPayload {
  extras?: Array<{ key: string; qty: number; note?: string }>;
  budget?: number;
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

function withBudget(next: ProjectSettings, amount: number, money: Money) {
  const { usd, entered } = money.enter(amount);

  next.budgetUsd = amount > 0 ? usd : undefined;
  next.budgetEntered = amount > 0 ? entered : undefined;
}

export function applyBuildSettings(project: ProjectSettings, pl: BuildSettingsPayload, money = currentMoney()) {
  const bad = (pl.extras ?? []).filter((x) => !describeKey(x.key)).map((x) => x.key);
  const next = { ...project };

  if (pl.extras) next.extras = mergeExtras(next.extras, pl.extras, bad);

  if (pl.budget !== undefined) withBudget(next, pl.budget, money);

  if (pl.material) next.material = pl.material;

  return { next, bad };
}
