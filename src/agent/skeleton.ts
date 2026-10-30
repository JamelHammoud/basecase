import { actuatorOf, COMPONENT_BY_ID } from '../data/components';
import type { RobotSkeleton, SkeletonJoint, SkeletonLimb, ZUpVec } from '../types/skeleton';
import { r1, r3 } from './agentFrame';
import { swapWords } from './agentMirror';

export interface SkeletonJointInput {
  id: string;
  name?: string;
  parent?: string;
  origin: ZUpVec;
  axis: ZUpVec;
  type?: 'revolute' | 'prismatic';
  range?: [number, number];
  limb?: SkeletonLimb;
  actuator?: string;
  tip?: ZUpVec;
  link_mass_g?: number;
}

export interface SkeletonPayload {
  joints: SkeletonJointInput[];
  pairs?: Array<[string, string]>;
  mass_g?: number;
  replace?: boolean;
}

export interface SkeletonBuild {
  skeleton: RobotSkeleton;
  problems: string[];
  moved: Map<string, ZUpVec>;
  turned: string[];
}

const SYMMETRY_MM = 0.5;

const len = (v: ZUpVec) => Math.hypot(v[0], v[1], v[2]);
const diff = (a: ZUpVec, b: ZUpVec): ZUpVec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (v: ZUpVec): ZUpVec => v.map((x) => r3(x / len(v))) as ZUpVec;
const fmt = (v: ZUpVec) => `[${v.map((x) => r1(x) + 0).join(', ')}]`;

function jointOf(j: SkeletonJointInput): SkeletonJoint {
  return {
    id: j.id,
    ...(j.name ? { name: j.name } : {}),
    ...(j.parent ? { parent: j.parent } : {}),
    origin: j.origin,
    axis: unit(j.axis),
    ...(j.type ? { type: j.type } : {}),
    ...(j.range ? { range: j.range } : {}),
    ...(j.limb ? { limb: j.limb } : {}),
    ...(j.actuator ? { actuator: j.actuator } : {}),
    ...(j.tip ? { tip: j.tip } : {}),
    ...(j.link_mass_g ? { linkMassG: j.link_mass_g } : {}),
  };
}

function actuatorProblem(j: SkeletonJoint): string | null {
  if (!j.actuator) return null;

  const [head, variant] = j.actuator.split('|');
  const id = head.replace(/^component:/, '');

  if (!COMPONENT_BY_ID[id]) return `${j.id}: unknown actuator "${j.actuator}"; find_parts lists the keys`;

  return actuatorOf(id, variant) ? null : `${j.id}: ${j.actuator} has no torque data (does it need a version?)`;
}

function hasCycle(j: SkeletonJoint, byId: Map<string, SkeletonJoint>): boolean {
  const seen = new Set<string>();
  let at: SkeletonJoint | undefined = j;

  while (at?.parent) {
    if (seen.has(at.id)) return true;

    seen.add(at.id);
    at = byId.get(at.parent);
  }

  return false;
}

function jointProblems(joints: SkeletonJoint[]): string[] {
  const byId = new Map(joints.map((j) => [j.id, j]));
  const problems: string[] = [];

  for (const j of joints) {
    const bad = [
      len(j.axis) === 0 || Number.isNaN(j.axis[0]) ? `${j.id}: the axis has no direction` : null,
      j.parent && !byId.has(j.parent) ? `${j.id}: no parent joint "${j.parent}"` : null,
      j.parent && byId.has(j.parent) && hasCycle(j, byId) ? `${j.id}: its parents loop back to it` : null,
      actuatorProblem(j),
    ];

    problems.push(...bad.filter((x): x is string => !!x));
  }

  return problems;
}

const SIDE_PAIRS: Array<[string, string][]> = [[['left', 'right']], [['front', 'rear']], [['front', 'back']]];

function autoPairs(joints: SkeletonJoint[]): Array<[string, string]> {
  const ids = new Set(joints.map((j) => j.id));
  const out: Array<[string, string]> = [];

  for (const words of SIDE_PAIRS)
    for (const j of joints) {
      const twin = swapWords(j.id, words);

      if (twin !== j.id && ids.has(twin) && !out.some((p) => p.includes(j.id) && p.includes(twin)))
        out.push([j.id, twin]);
    }

  return out;
}

export const pairAxis = (pair: [string, string]): 'x' | 'y' => (/left|right/i.test(pair.join(' ')) ? 'x' : 'y');

export function mirrorPoint(v: ZUpVec, axis: 'x' | 'y'): ZUpVec {
  return axis === 'x' ? [-v[0], v[1], v[2]] : [v[0], -v[1], v[2]];
}

function pairProblems(skeleton: RobotSkeleton): string[] {
  const byId = new Map(skeleton.joints.map((j) => [j.id, j]));

  return skeleton.pairs.flatMap((pair) => {
    const [a, b] = pair.map((id) => byId.get(id));

    if (!a || !b) return [`pair ${pair.join(' / ')}: ${a ? pair[1] : pair[0]} isn't a joint`];

    const off = len(diff(mirrorPoint(a.origin, pairAxis(pair)), b.origin));

    return off > SYMMETRY_MM ? [`pair ${pair.join(' / ')}: not mirror images, ${r1(off)} mm apart`] : [];
  });
}

function mergedJoints(payload: SkeletonPayload, previous?: RobotSkeleton): SkeletonJoint[] {
  const made = payload.joints.map(jointOf);
  const kept = payload.replace ? [] : (previous?.joints ?? []).filter((j) => !made.some((m) => m.id === j.id));

  return [...kept, ...made];
}

function changes(previous: RobotSkeleton | undefined, joints: SkeletonJoint[]) {
  const moved = new Map<string, ZUpVec>();
  const turned: string[] = [];

  for (const j of joints) {
    const was = previous?.joints.find((p) => p.id === j.id);

    if (was && len(diff(j.origin, was.origin)) > 1e-3) moved.set(j.id, diff(j.origin, was.origin));

    if (was && len(diff(j.axis, was.axis)) > 1e-3) turned.push(j.id);
  }

  return { moved, turned };
}

export function buildSkeleton(payload: SkeletonPayload, previous?: RobotSkeleton): SkeletonBuild {
  const joints = mergedJoints(payload, previous);
  const ids = new Set(joints.map((j) => j.id));
  const given = [...(payload.replace ? [] : (previous?.pairs ?? [])), ...(payload.pairs ?? [])];
  const pairs = [...given, ...autoPairs(joints)].filter(
    (p, i, all) => ids.has(p[0]) && all.findIndex((q) => q.includes(p[0]) && q.includes(p[1])) === i,
  );
  const massG = payload.mass_g ?? previous?.massG;
  const skeleton: RobotSkeleton = { frame: 'z-up', joints, pairs, ...(massG ? { massG } : {}) };

  return {
    skeleton,
    problems: [...jointProblems(joints), ...pairProblems(skeleton)],
    ...changes(previous, joints),
  };
}

export function childrenOf(skeleton: RobotSkeleton, id: string): SkeletonJoint[] {
  return skeleton.joints.filter((j) => j.parent === id);
}

export function linkEnds(skeleton: RobotSkeleton, j: SkeletonJoint): ZUpVec[] {
  return [...childrenOf(skeleton, j.id).map((c) => c.origin), ...(j.tip ? [j.tip] : [])];
}

export function linkLength(skeleton: RobotSkeleton, j: SkeletonJoint): number {
  return Math.max(0, ...linkEnds(skeleton, j).map((e) => len(diff(e, j.origin))));
}

function jointLine(skeleton: RobotSkeleton, j: SkeletonJoint): string {
  const link = linkLength(skeleton, j);
  const to = childrenOf(skeleton, j.id).map((c) => c.id);
  const bits = [
    `- ${j.id}${j.limb ? ` (${j.limb})` : ''}: at ${fmt(j.origin)} axis ${fmt(j.axis)}`,
    link ? `link ${r1(link)} mm${to.length ? ` to ${to.join(', ')}` : ' to its tip'}` : '',
    j.actuator ?? '',
  ];

  return bits.filter(Boolean).join(', ');
}

export function skeletonText(build: SkeletonBuild): string {
  const { skeleton, problems } = build;
  const pairs = skeleton.pairs.map((p) => `${p[0]} / ${p[1]}`);

  return [
    `Skeleton: ${skeleton.joints.length} joints${skeleton.massG ? `, ${r1(skeleton.massG / 1000)} kg estimated` : ''}.`,
    ...skeleton.joints.map((j) => jointLine(skeleton, j)),
    pairs.length ? `Symmetric pairs: ${pairs.join(', ')}.` : '',
    problems.length ? `Problems:\n- ${problems.join('\n- ')}` : '',
    build.turned.length
      ? `Axis changed for ${build.turned.join(', ')}: parts in their frames kept their rotation.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
