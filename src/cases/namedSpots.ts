import type { CaseSpec } from './caseBuilder';
import { groundOf, type BuilderRobot, type CaseGoal, type GoalSpots, type GoalValues } from './caseGoals';
import type { CaseWorld } from './caseWorlds';
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
  spots: GoalSpots;
  robot: BuilderRobot;
  given?: Partial<GoalValues>;
}

export function tripTimed(values: GoalValues, { spots, robot, given }: Trip): GoalValues {
  const stops = spots.flatMap((s) => (s ? [s.at] : []));

  if (!stops.length || given?.seconds !== undefined) return values;

  const points = [robot.pivot, ...stops];
  const tripMm = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[2] - points[i][2]), 0);
  const rate = TRIP_MM_PER_S[groundOf(robot.facts) === 'legs' ? 'legs' : 'wheels'];

  return { ...values, seconds: Math.min(MAX_SECONDS, Math.max(values.seconds, Math.ceil(tripMm / rate))) };
}
