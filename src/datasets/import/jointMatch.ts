import type { SimModel } from '../../sim/mjcfTypes';
import { toRadians, type ColumnSpan, type SourceUnit } from './units';

export interface TargetJoint {
  id: string;
  names: string[];
  robot: string;
  type: 'revolute' | 'prismatic';
  range: [number, number] | null;
}

export type JointPairs = Array<string | null>;

export interface MatchInput {
  names: string[];
  spans: ColumnSpan[];
  unit: SourceUnit;
  targets: TargetJoint[];
  robots: string[];
}

export interface JointMatch {
  joints: JointPairs;
  complete: boolean;
}

export const RANGE_SLACK_DEG = 5;

const SIDE = /^(left|right|l|r)_(.+)$/;
const SIDE_SLOT: Record<string, number> = { left: 0, l: 0, right: 1, r: 1 };

export function normalizedJoint(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/(_(pos|position|joint|q))+$/, '');
}

const withoutSlot = (id: string) => id.replace(/^[^.]*\./, '');

const armOf = (j: SimModel['joints'][number]) => (j.id.includes('.') ? `slot:${j.id.split('.')[0]}` : j.robot);

export const targetJoints = (model: SimModel, names: Record<string, string> = {}): TargetJoint[] =>
  model.joints
    .filter((j) => j.actuator >= 0)
    .map((j) => ({
      id: j.id,
      names: [...new Set([names[j.id] ?? names[withoutSlot(j.id)], withoutSlot(j.id)].filter((n) => !!n))],
      robot: armOf(j),
      type: j.type,
      range: j.range ?? null,
    }));

const endsOn = (whole: string, end: string) => whole === end || whole.endsWith(`_${end}`);

const suffixFits = (a: string, b: string) => endsOn(a, b) || endsOn(b, a);

type Rule = (source: string, target: string) => boolean;

function uniqueTarget(source: string, candidates: TargetJoint[], rule: Rule): string | null {
  const found = candidates.filter((t) => t.names.some((name) => rule(source, normalizedJoint(name))));

  return found.length === 1 ? found[0].id : null;
}

interface Pass {
  rule: Rule;
  scope: (name: string, free: TargetJoint[]) => { source: string; candidates: TargetJoint[] } | null;
}

function sidePass(robots: string[]): Pass['scope'] {
  return (name, free) => {
    const side = SIDE.exec(normalizedJoint(name));
    const robot = side && robots.length > 1 ? robots[SIDE_SLOT[side[1]]] : undefined;

    return side && robot ? { source: side[2], candidates: free.filter((t) => t.robot === robot) } : null;
  };
}

function runPass(joints: JointPairs, input: MatchInput, pass: Pass) {
  input.names.forEach((name, i) => {
    if (joints[i]) return;

    const used = new Set(joints);
    const scoped = pass.scope(
      name,
      input.targets.filter((t) => !used.has(t.id)),
    );
    const found = scoped && uniqueTarget(scoped.source, scoped.candidates, pass.rule);

    joints[i] = found ?? null;
  });
}

export function matchByName(input: MatchInput): JointMatch {
  const joints: JointPairs = input.names.map(() => null);
  const all: Pass['scope'] = (name, free) => ({ source: normalizedJoint(name), candidates: free });
  const exact: Rule = (a, b) => a === b;

  runPass(joints, input, { rule: exact, scope: all });
  runPass(joints, input, { rule: exact, scope: sidePass(input.robots) });
  runPass(joints, input, { rule: suffixFits, scope: sidePass(input.robots) });
  runPass(joints, input, { rule: suffixFits, scope: all });

  return { joints, complete: joints.every((j) => j !== null) };
}

function spanInTargetUnits(span: ColumnSpan, unit: SourceUnit, target: TargetJoint): [number, number] | null {
  if (target.type === 'prismatic') return unit === 'rad' ? [span.lo * 1000, span.hi * 1000] : null;

  const deg = (v: number) => (toRadians(v, unit) * 180) / Math.PI;

  return [deg(span.lo), deg(span.hi)];
}

export function fitsRange(span: ColumnSpan, unit: SourceUnit, target: TargetJoint): boolean {
  const seen = spanInTargetUnits(span, unit, target);

  if (!seen) return false;

  if (!target.range) return true;

  const slack = target.type === 'prismatic' ? 0 : RANGE_SLACK_DEG;

  return seen[0] >= target.range[0] - slack && seen[1] <= target.range[1] + slack;
}

export function prefilled(input: MatchInput, match: JointMatch): JointPairs {
  const joints = [...match.joints];
  let next = 0;

  input.names.forEach((_, i) => {
    if (joints[i]) return;

    const used = new Set(joints);
    const at = input.targets.findIndex(
      (t, k) => k >= next && !used.has(t.id) && fitsRange(input.spans[i], input.unit, t),
    );

    if (at < 0) return;

    joints[i] = input.targets[at].id;
    next = at + 1;
  });

  return joints;
}

export function rememberedPairs(remembered: JointPairs | null | undefined, input: MatchInput): JointPairs | null {
  if (!remembered || remembered.length !== input.names.length) return null;

  const ids = new Set(input.targets.map((t) => t.id));

  return remembered.every((id) => id === null || ids.has(id)) ? remembered : null;
}

export function armsOf(targets: TargetJoint[], robotKeys: string[]): string[] {
  const present = new Set(targets.map((t) => t.robot));
  const slots = [...present].filter((arm) => !robotKeys.includes(arm)).sort();

  return [...robotKeys.filter((key) => present.has(key)), ...slots];
}

export const matchKey = (origin: string, names: string[], targets: TargetJoint[]) =>
  JSON.stringify([origin, names, targets.map((t) => t.id)]);
