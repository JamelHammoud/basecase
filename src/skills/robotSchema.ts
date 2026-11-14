import type { SimBody, SimModel, SimRobot } from '../sim/mjcfTypes';
import type { RobotMorphology } from '../sim/morphology';

export const ROBOT_SCHEMA_FORMAT = 'basecase-robot-schema';
export const ROBOT_SCHEMA_VERSION = 1;

export interface SchemaJoint {
  id: string;
  limb: number;
  depth: number;
}

export interface RobotSchema {
  format: typeof ROBOT_SCHEMA_FORMAT;
  version: typeof ROBOT_SCHEMA_VERSION;
  bodyClass: RobotMorphology;
  floating: boolean;
  joints: SchemaJoint[];
  limbs: Array<[number, number]>;
}

const BODY_CLASSES: Record<RobotMorphology, string> = {
  fixed: 'fixed-base',
  legged: 'legged',
  wheeled: 'wheeled',
  'wheel-legged': 'wheel-legged',
};

export const bodyClassWords = (bodyClass: RobotMorphology) => BODY_CLASSES[bodyClass];

const ROUND = 1000;

function jointChain(body: SimBody, byName: Map<string, SimBody>): SimBody[] {
  const chain: SimBody[] = [];

  for (let at: SimBody | undefined = body; at?.joint; at = at.parent ? byName.get(at.parent) : undefined)
    chain.push(at);

  return chain;
}

function normalized(values: number[]): number[] {
  const most = Math.max(0, ...values.map(Math.abs));

  return values.map((v) => (most > 0 ? Math.round((v / most) * ROUND) / ROUND : 0));
}

function anchors(limbRoots: SimBody[], root: SimBody | undefined): Array<[number, number]> {
  const [x0, , z0] = root?.origin ?? [0, 0, 0];
  const xs = normalized(limbRoots.map((b) => b.origin[0] - x0));
  const zs = normalized(limbRoots.map((b) => b.origin[2] - z0));

  return limbRoots.map((_, i) => [xs[i], zs[i]]);
}

function robotOf(model: SimModel, key?: string): SimRobot {
  const robot = key ? model.robots.find((r) => r.key === key) : model.robots[0];

  if (!robot) throw new Error('There’s no robot in this scene.');

  return robot;
}

export function robotSchema(model: SimModel, options: { robot?: string; joints?: string[] } = {}): RobotSchema {
  const robot = robotOf(model, options.robot);
  const byName = new Map(model.bodies.map((b) => [b.name, b]));
  const byJoint = new Map(model.bodies.flatMap((b) => (b.joint ? [[b.joint, b] as const] : [])));
  const limbRoots: SimBody[] = [];
  const joints = (options.joints ?? robot.joints).map((id) => {
    const body = byJoint.get(id);
    const chain = body ? jointChain(body, byName) : [];
    const top = chain.at(-1);
    let limb = top ? limbRoots.indexOf(top) : -1;

    if (top && limb < 0) limb = limbRoots.push(top) - 1;

    return { id, limb, depth: chain.length };
  });

  return {
    format: ROBOT_SCHEMA_FORMAT,
    version: ROBOT_SCHEMA_VERSION,
    bodyClass: robot.morphology,
    floating: robot.floating,
    joints,
    limbs: anchors(limbRoots, byName.get(robot.root)),
  };
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isSchemaJoint = (j: unknown, limbs: number): j is SchemaJoint => {
  const v = j as Partial<SchemaJoint> | null;

  return (
    typeof v?.id === 'string' &&
    Number.isInteger(v.limb) &&
    Number.isInteger(v.depth) &&
    v.limb! >= -1 &&
    v.limb! < limbs &&
    v.depth! >= 0
  );
};

export function isRobotSchema(value: unknown): value is RobotSchema {
  const v = value as Partial<RobotSchema> | null;
  const limbs = Array.isArray(v?.limbs) ? v.limbs : null;

  return (
    v?.format === ROBOT_SCHEMA_FORMAT &&
    v.version === ROBOT_SCHEMA_VERSION &&
    typeof v.bodyClass === 'string' &&
    v.bodyClass in BODY_CLASSES &&
    typeof v.floating === 'boolean' &&
    !!limbs &&
    limbs.every((a) => Array.isArray(a) && a.length === 2 && a.every(isFiniteNumber)) &&
    Array.isArray(v.joints) &&
    v.joints.every((j) => isSchemaJoint(j, limbs.length))
  );
}

interface Limb {
  index: number;
  anchor: [number, number];
  joints: number[];
}

function limbsOf(schema: RobotSchema): Limb[] | null {
  const limbs: Limb[] = schema.limbs.map((anchor, index) => ({ index, anchor, joints: [] }));

  for (const [i, joint] of schema.joints.entries()) {
    const limb = limbs[joint.limb];

    if (!limb || limb.joints[joint.depth - 1] !== undefined) return null;

    limb.joints[joint.depth - 1] = i;
  }

  return limbs.every((l) => l.joints.length > 0 && l.joints.every((j) => j !== undefined)) ? limbs : null;
}

const distance = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function nearest(limb: Limb, from: Limb[]): Limb | null {
  const fitting = from.filter((l) => l.joints.length === limb.joints.length);

  return fitting.reduce<Limb | null>(
    (best, l) => (!best || distance(l.anchor, limb.anchor) < distance(best.anchor, limb.anchor) ? l : best),
    null,
  );
}

const sizes = (limbs: Limb[]) => [...new Set(limbs.map((l) => l.joints.length))].sort((a, b) => a - b).join(' and ');

export type JointMap = { ok: true; map: number[] } | { ok: false; problem: string };

function classProblem(source: RobotSchema, target: RobotSchema): string | null {
  if (source.bodyClass !== target.bodyClass)
    return `This skill is for a ${bodyClassWords(source.bodyClass)} robot, and this one is ${bodyClassWords(target.bodyClass)}.`;

  if (source.floating !== target.floating)
    return source.floating ? 'This skill is for a robot that moves freely.' : 'This skill is for a fixed-base robot.';

  return null;
}

export function jointMap(source: RobotSchema, target: RobotSchema): JointMap {
  const problem = classProblem(source, target);

  if (problem) return { ok: false, problem };

  const from = limbsOf(source);
  const to = limbsOf(target);

  if (!from || !to) return { ok: false, problem: 'A limb branches, so its joints can’t be matched one to one.' };

  const pairs = to.map((limb) => ({ limb, match: nearest(limb, from) }));

  if (pairs.some((p) => !p.match))
    return {
      ok: false,
      problem: `This skill moves limbs of ${sizes(from)} joints, and this robot has limbs of ${sizes(to)}.`,
    };

  const map = new Array<number>(target.joints.length);

  for (const { limb, match } of pairs) limb.joints.forEach((j, depth) => (map[j] = match!.joints[depth]));

  return { ok: true, map };
}
