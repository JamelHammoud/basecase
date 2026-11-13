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
} from './caseGoals';
import { CASE_WORLDS, type CaseWorld, type WorldKind } from './caseWorlds';
import { robotFacts, type RobotFacts } from './robotFit';
import { groundRoute } from './groundRoute';
import type { Room } from './roomPlan';
import { roomWorld } from './roomWorld';
import { CASE_FORMAT_VERSION, parseCase, type Case, type ReferenceCommand, type WorldObject } from './schema';
import type { CaseTemplate } from './templates';
import { dotSpots } from './touchTheDots';
import { CaseFileError } from './validate';

export interface CaseSpec {
  goal: GoalKind;
  world: WorldKind;
  values?: Partial<GoalValues>;
  name?: string;
  brief?: string;
  objects?: WorldObject[];
  room?: Room;
}

export type BuiltCase = { ok: true; kase: Case } | { ok: false; problem: string };

const MAX_NAME = 80;
const MAX_ID = 60;

function armSpot(rig: Rig, facts: RobotFacts): V3 | null {
  const effector = facts.endEffector;

  if (!effector) return null;

  const arm = { joints: facts.armJoints, anchor: facts.anchor, reachMm: facts.reachMm };
  const spots = dotSpots(rig, effector, arm, touchRadius(facts.reachMm));

  const ahead = spots.filter((s) => s[2] >= facts.anchor[2]);

  return ahead.reduce<V3 | null>((low, s) => (!low || s[1] < low[1] ? s : low), null);
}

export function builderRobot(rig: Rig, parts: ScenePart[]): BuilderRobot {
  const robot = rig.robots[0];
  const facts = robotFacts(rig, parts);
  const own = parts.filter((p) => robot?.parts.has(p.id));
  const xs = own.flatMap((p) => [p.position[0] - p.dimensions.width / 2, p.position[0] + p.dimensions.width / 2]);
  const zs = own.flatMap((p) => [p.position[2] - p.dimensions.depth / 2, p.position[2] + p.dimensions.depth / 2]);
  const span = (values: number[]) => (values.length ? Math.max(...values) - Math.min(...values) : 0);
  const tops = own.map((p) => p.position[1] + p.dimensions.height / 2);

  return {
    facts,
    pivot: robot?.pivot ?? ([0, 0, 0] as V3),
    footprint: { width: span(xs), depth: span(zs) },
    heightMm: tops.length ? Math.max(...tops) : 0,
    armSpot: armSpot(rig, facts),
  };
}

export const goalOf = (kind: GoalKind): CaseGoal | undefined => CASE_GOALS.find((g) => g.kind === kind);

const worldsWith = (room?: Room): CaseWorld[] => (room ? [...CASE_WORLDS, roomWorld(room)] : CASE_WORLDS);

export const worldOf = (kind: WorldKind, room?: Room): CaseWorld | undefined =>
  worldsWith(room).find((w) => w.kind === kind);

const canDo = (goal: CaseGoal, robot: BuilderRobot) => goal.needs.some((n) => robot.facts.capabilities.includes(n));

export const goalsFor = (robot: BuilderRobot): CaseGoal[] => CASE_GOALS.filter((g) => canDo(g, robot));

export const worldsFor = (goal: GoalKind, robot?: BuilderRobot, room?: Room): CaseWorld[] =>
  worldsWith(room).filter((w) => w.fits(goal, robot));

export const fittingTemplates = (templates: CaseTemplate[]): CaseTemplate[] => templates.filter((t) => !t.refusal);

export function caseName(goal: GoalKind, world: WorldKind, room?: Room): string {
  const suffix = worldOf(world, room)?.suffix;

  return [goalOf(goal)?.name ?? 'Case', suffix].filter(Boolean).join(' ');
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_ID) || 'case';

export function goalValues(
  goal: CaseGoal,
  robot: BuilderRobot,
  given: Partial<GoalValues> = {},
  world: WorldKind = 'floor',
): GoalValues {
  const values = goalDefaults(goal.kind, robot, world);

  for (const key of goal.params) {
    const v = given[key];
    const { min, max } = goalParam(goal, key);

    if (typeof v === 'number' && Number.isFinite(v)) values[key] = Math.min(max, Math.max(min, v));
  }

  return values;
}

const footprintHits = (o: WorldObject, robot: BuilderRobot) =>
  o.behavior === 'static' &&
  Math.abs(o.position[0] - robot.pivot[0]) < (o.size[0] + robot.footprint.width) / 2 &&
  Math.abs(o.position[2] - robot.pivot[2]) < (o.size[2] + robot.footprint.depth) / 2;

function choose(spec: CaseSpec, robot: BuilderRobot): { goal: CaseGoal; world: CaseWorld } | string {
  const goal = goalOf(spec.goal);
  const world = worldOf(spec.world, spec.room);

  if (!goal || !canDo(goal, robot)) {
    const fits = goalsFor(robot).map((g) => g.kind);

    return `Pick a goal this robot can try: ${fits.join(', ') || 'none until it has an arm, wheels or legs'}.`;
  }

  if (!world || !world.fits(goal.kind, robot))
    return `Pick a world for ${goal.name}: ${worldsFor(goal.kind, robot, spec.room)
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
    headroomMm: robot.heightMm || undefined,
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
  const name = spec.name?.trim().slice(0, MAX_NAME) || caseName(goal.kind, world.kind, spec.room);
  const guard = plan.slot.needs.includes('legs') ? fallGuard(robot) : null;

  return {
    formatVersion: CASE_FORMAT_VERSION,
    id: slug(name),
    name,
    brief: spec.brief?.trim() || plan.brief,
    slot: world.trueSize ? { ...plan.slot, reachMm: undefined, anchor: undefined } : plan.slot,
    world: { objects: [...plan.objects, ...scenery, ...(spec.objects ?? [])] },
    controls: plan.controls,
    reference: { timeline: referenceOf(plan, scenery, robot) },
    task: {
      seconds: values.seconds,
      probes: [...plan.probes, ...(guard ? [guard.probe] : [])],
      contract: { version: 1, success: plan.success, failures: guard ? [guard.failure] : [] },
    },
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
