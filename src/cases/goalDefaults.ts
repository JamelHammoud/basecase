import type { V3 } from '../utils/kinematics';
import { DOT_MOVE_SECONDS, type BuilderRobot, type GoalKind, type GoalValues } from './caseGoals';
import type { WorldKind } from './caseWorlds';
import { pickDefaults } from './pickGoal';

const DOT_SPARE_SECONDS = 0.5;
const TOUCH_SECONDS = 4;

export const touchRadius = (reachMm: number) => Math.max(12, reachMm * 0.08);

function touchSpot({ facts, armSpots }: BuilderRobot): Partial<GoalValues> {
  const [x, y, z] = facts.anchor;
  const armSpot = armSpots
    .filter((s) => s[2] >= z)
    .reduce<V3 | null>((low, s) => (!low || s[1] < low[1] ? s : low), null);

  if (!armSpot) return { distanceMm: Math.round(facts.reachMm * 0.6), heightMm: Math.round(y) };

  return {
    distanceMm: Math.round(armSpot[2] - z),
    heightMm: Math.round(armSpot[1]),
    sideMm: Math.round(armSpot[0] - x),
  };
}

const BOX_SHARE = 0.5;
const BOX_OVER_BODY = 1.3;
const MIN_BOX_MM = 60;
const MAX_BOX_MM = 300;

function boxFor(robot: BuilderRobot): number {
  const legs = robot.facts.capabilities.includes('legs');
  const size = Math.max(robot.footprint.width * BOX_SHARE, legs ? robot.pivot[1] * BOX_OVER_BODY : 0);

  return Math.min(MAX_BOX_MM, Math.max(MIN_BOX_MM, Math.round(size / 10) * 10));
}

const AROUND_SECONDS = { legs: 8, wheels: 5 };

const touchSeconds = (dots: number) =>
  Math.max(TOUCH_SECONDS, Math.ceil(DOT_SPARE_SECONDS + Math.round(dots) * DOT_MOVE_SECONDS));

export function goalDefaults(
  kind: GoalKind,
  robot: BuilderRobot,
  world: WorldKind = 'floor',
  chosen: Partial<GoalValues> = {},
): GoalValues {
  const legs = robot.facts.capabilities.includes('legs');
  const reach = robot.facts.reachMm;
  const base: GoalValues = {
    dots: 1,
    distanceMm: 900,
    heightMm: 0,
    sideMm: 0,
    radiusMm: 160,
    pushMm: 500,
    boxMm: 150,
    stops: 3,
    spacingMm: 600,
    seconds: legs ? 14 : 8,
  };
  const byKind: Record<GoalKind, Partial<GoalValues>> = {
    reach: {},
    push: { radiusMm: 150, boxMm: boxFor(robot), seconds: legs ? 18 : 10 },
    path: { seconds: legs ? 22 : 13 },
    walk: { distanceMm: 500 },
    touch: { ...touchSpot(robot), radiusMm: Math.round(touchRadius(reach)), seconds: touchSeconds(chosen.dots ?? 1) },
    pick: pickDefaults(robot),
    handoff: { ...touchSpot(robot), radiusMm: Math.round(touchRadius(reach)), seconds: 7 },
  };

  const values = { ...base, ...byKind[kind] };
  const around = world === 'block' ? AROUND_SECONDS[legs ? 'legs' : 'wheels'] : 0;

  return { ...values, seconds: values.seconds + around };
}
