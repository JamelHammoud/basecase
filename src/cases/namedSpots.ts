import type { CaseSpec } from './caseBuilder';
import {
  groundOf,
  type BuilderRobot,
  type CaseGoal,
  type GoalPlan,
  type GoalSpots,
  type GoalValues,
} from './caseGoals';
import type { CaseWorld, WorldKind } from './caseWorlds';
import { roomTargets, targetNamed } from './roomTargets';

const TRIP_MM_PER_S = { wheels: 100, legs: 60 };
const MAX_SECONDS = 120;

export function spotsOf(
  spec: CaseSpec,
  { goal, world }: { goal: CaseGoal; world: CaseWorld },
  robot: BuilderRobot,
): GoalSpots | string {
  const asked = spec.targets ?? [];

  if (!asked.some(Boolean)) return [];

  if (world.kind !== 'room' || !spec.room) return `Pick a world for ${goal.name}: room.`;

  const targets = roomTargets(spec.room, robot);
  const spots = asked.map((name) => (name ? (targetNamed(targets, name) ?? name) : null));

  if (spots.some((s) => typeof s === 'string'))
    return `Pick a target in ${spec.room.name}: ${targets.map((t) => t.name).join(', ')}.`;

  return spots as GoalSpots;
}

interface Trip {
  goal: CaseGoal;
  world: WorldKind;
  spots: GoalSpots;
  robot: BuilderRobot;
  given?: Partial<GoalValues>;
}

function tripMm(plan: GoalPlan, robot: BuilderRobot): number {
  const points = [robot.pivot, ...(plan.waypoints ?? []).map((w) => w.at)];

  return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[2] - points[i][2]), 0);
}

export function tripTimed(values: GoalValues, { goal, world, spots, robot, given }: Trip) {
  const plan = goal.plan(robot, values, world, spots);

  if (!spots.some(Boolean) || given?.seconds !== undefined) return { values, plan };

  const rate = TRIP_MM_PER_S[groundOf(robot.facts) === 'legs' ? 'legs' : 'wheels'];
  const seconds = Math.min(MAX_SECONDS, Math.max(values.seconds, Math.ceil(tripMm(plan, robot) / rate)));

  if (seconds === values.seconds) return { values, plan };

  const timed = { ...values, seconds };

  return { values: timed, plan: goal.plan(robot, timed, world, spots) };
}
