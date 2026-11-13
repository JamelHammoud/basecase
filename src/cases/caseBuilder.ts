import type { ScenePart } from '../types/robotics';
import type { Rig, V3 } from '../utils/kinematics';
import {
  CASE_GOALS,
  fallGuard,
  goalParam,
  goalDefaults,
  routeClearance,
  touchRadius,
  type BuilderRobot,
  type CaseGoal,
  type GoalKind,
  type GoalPlan,
  type GoalValues,
  type ParamKey,
} from './caseGoals';
import { CASE_WORLDS, type CaseWorld, type WorldKind } from './caseWorlds';
import { handoffGoal } from './handoffGoal';
import { robotFacts, type RobotFacts } from './robotFit';
import { groundRoute } from './groundRoute';
import { CASE_FORMAT_VERSION, parseCase, type Case, type ReferenceCommand, type WorldObject } from './schema';
import { dotSpots } from './dotSpots';
import { CaseFileError } from './validate';

export interface CaseSpec {
  goal: GoalKind;
  world: WorldKind;
  values?: Partial<GoalValues>;
  name?: string;
  brief?: string;
  objects?: WorldObject[];
  logic?: unknown;
  score?: unknown;
}

export type BuiltCase = { ok: true; kase: Case } | { ok: false; problem: string };

const MAX_NAME = 80;
const MAX_ID = 60;

function armSpots(rig: Rig, facts: RobotFacts): V3[] {
  const effector = facts.endEffector;

  if (!effector) return [];

  const arm = { joints: facts.armJoints, anchor: facts.anchor, reachMm: facts.reachMm };

  return dotSpots(rig, effector, arm, touchRadius(facts.reachMm));
}

export function builderRobot(rig: Rig, parts: ScenePart[]): BuilderRobot {
  const robot = rig.robots[0];
  const facts = robotFacts(rig, parts);
  const own = parts.filter((p) => robot?.parts.has(p.id));
  const xs = own.flatMap((p) => [p.position[0] - p.dimensions.width / 2, p.position[0] + p.dimensions.width / 2]);
  const zs = own.flatMap((p) => [p.position[2] - p.dimensions.depth / 2, p.position[2] + p.dimensions.depth / 2]);
  const span = (values: number[]) => (values.length ? Math.max(...values) - Math.min(...values) : 0);

  return {
    facts,
    pivot: robot?.pivot ?? ([0, 0, 0] as V3),
    footprint: { width: span(xs), depth: span(zs) },
    armSpots: armSpots(rig, facts),
  };
}

const GOALS: CaseGoal[] = [...CASE_GOALS, handoffGoal];

export const goalOf = (kind: GoalKind): CaseGoal | undefined => GOALS.find((g) => g.kind === kind);

export const worldOf = (kind: WorldKind): CaseWorld | undefined => CASE_WORLDS.find((w) => w.kind === kind);

const able = (needs: CaseGoal['needs'], robot: BuilderRobot | undefined) =>
  !!robot && needs.some((n) => robot.facts.capabilities.includes(n));

const canDo = (goal: CaseGoal, robot: BuilderRobot) =>
  able(goal.needs, robot) && (!goal.pair || able(goal.needs, robot.partner));

export const goalsFor = (robot: BuilderRobot): CaseGoal[] => GOALS.filter((g) => canDo(g, robot));

export const worldsFor = (goal: GoalKind): CaseWorld[] => CASE_WORLDS.filter((w) => w.fits(goal));

export const CASE_PRESETS = {
  'touch-the-dots': { goal: 'touch', world: 'floor', values: { dots: 3 } },
  'reach-the-flag': { goal: 'reach', world: 'floor' },
} as const satisfies Record<string, CaseSpec>;

export type PresetId = keyof typeof CASE_PRESETS;

export const presetsFor = (robot: BuilderRobot): PresetId[] =>
  (Object.keys(CASE_PRESETS) as PresetId[]).filter((id) =>
    goalsFor(robot).some((g) => g.kind === CASE_PRESETS[id].goal),
  );

export const goalFields = (goal: CaseGoal, values: GoalValues): ParamKey[] => goal.fields?.(values) ?? goal.params;

export function caseName(goal: GoalKind, world: WorldKind, values?: GoalValues): string {
  const suffix = worldOf(world)?.suffix;
  const kind = goalOf(goal);
  const title = kind && values ? kind.title?.(values) : undefined;

  return [title ?? kind?.name ?? 'Case', suffix].filter(Boolean).join(' ');
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_ID) || 'case';

export function uniqueCaseId(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;

  let n = 2;

  while (taken.includes(`${base}-${n}`)) n++;

  return `${base}-${n}`;
}

export function goalValues(
  goal: CaseGoal,
  robot: BuilderRobot,
  given: Partial<GoalValues> = {},
  world: WorldKind = 'floor',
): GoalValues {
  const chosen: Partial<GoalValues> = {};

  for (const key of goal.params) {
    const v = given[key];
    const { min, max } = goalParam(goal, key);

    if (typeof v === 'number' && Number.isFinite(v)) chosen[key] = Math.min(max, Math.max(min, v));
  }

  return { ...goalDefaults(goal.kind, robot, world, chosen), ...chosen };
}

const footprintHits = (o: WorldObject, robot: BuilderRobot) =>
  o.behavior === 'static' &&
  Math.abs(o.position[0] - robot.pivot[0]) < (o.size[0] + robot.footprint.width) / 2 &&
  Math.abs(o.position[2] - robot.pivot[2]) < (o.size[2] + robot.footprint.depth) / 2;

function choose(spec: CaseSpec, robot: BuilderRobot): { goal: CaseGoal; world: CaseWorld } | string {
  const goal = goalOf(spec.goal);
  const world = worldOf(spec.world);

  if (!goal || !canDo(goal, robot)) {
    const fits = goalsFor(robot).map((g) => g.kind);

    return `Pick a goal this robot can try: ${fits.join(', ') || 'none until it has an arm, wheels or legs'}.`;
  }

  if (!world || !world.fits(goal.kind))
    return `Pick a world for ${goal.name}: ${worldsFor(goal.kind)
      .map((w) => w.kind)
      .join(', ')}.`;

  return { goal, world };
}

const ROUTE_START_S = 0.5;

function referenceOf(plan: GoalPlan, scenery: WorldObject[], robot: BuilderRobot): ReferenceCommand[] {
  if (!plan.waypoints) return plan.timeline;

  const route = groundRoute(plan.waypoints, [...plan.objects, ...scenery], {
    start: robot.pivot,
    clearanceMm: routeClearance(robot),
  });

  return route.map(({ at, speed, push }) => ({
    at: ROUTE_START_S,
    target: at,
    ...(speed ? { v: [speed, 0, 0] as V3 } : {}),
    ...(push ? { push } : {}),
  }));
}

interface Draft {
  spec: CaseSpec;
  goal: CaseGoal;
  world: CaseWorld;
  values: GoalValues;
  plan: GoalPlan;
  scenery: WorldObject[];
  robot: BuilderRobot;
}

function caseJson({ spec, goal, world, values, plan, scenery, robot }: Draft): unknown {
  const name = spec.name?.trim().slice(0, MAX_NAME) || caseName(goal.kind, world.kind, values);
  const guard = plan.slot.needs.includes('legs') ? fallGuard(robot) : null;

  return {
    formatVersion: CASE_FORMAT_VERSION,
    id: slug(name),
    name,
    brief: spec.brief?.trim() || plan.brief,
    ...(plan.slots ? { slots: plan.slots } : { slot: plan.slot }),
    world: { objects: [...plan.objects, ...scenery, ...(spec.objects ?? [])] },
    controls: plan.controls,
    reference: { timeline: referenceOf(plan, scenery, robot) },
    task: {
      seconds: values.seconds,
      probes: [...plan.probes, ...(guard ? [guard.probe] : [])],
      contract: { version: 1, success: plan.success, failures: guard ? [guard.failure] : [] },
      ...(spec.score !== undefined ? { score: spec.score } : {}),
    },
    ...(spec.logic !== undefined ? { logic: spec.logic } : {}),
  };
}

export function buildCase(spec: CaseSpec, robot: BuilderRobot): BuiltCase {
  const chosen = choose(spec, robot);

  if (typeof chosen === 'string') return { ok: false, problem: chosen };

  const { goal, world } = chosen;
  const values = goalValues(goal, robot, spec.values, world.kind);
  const plan = goal.plan(robot, values, world.kind);
  const scenery = world.objects(plan, robot);
  const problem =
    goal.problem?.(robot, values) ??
    (scenery.some((o) => footprintHits(o, robot)) ? `Move the goal farther ahead to fit the ${world.name}.` : null);

  if (problem) return { ok: false, problem };

  try {
    return { ok: true, kase: parseCase(caseJson({ spec, goal, world, values, plan, scenery, robot })) };
  } catch (e) {
    if (e instanceof CaseFileError) return { ok: false, problem: e.message };

    throw e;
  }
}

export function presetCase(id: PresetId, rig: Rig, parts: ScenePart[]): Case {
  const built = buildCase(CASE_PRESETS[id], builderRobot(rig, parts));

  if (!built.ok) throw new Error(built.problem);

  return built.kase;
}
