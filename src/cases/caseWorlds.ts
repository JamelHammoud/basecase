import type { V3 } from '../utils/kinematics';
import type { BuilderRobot, GoalKind, GoalPlan } from './caseGoals';
import type { WorldObject } from './schema';

export type WorldKind = 'floor' | 'corridor' | 'block' | 'shelf';

export interface CaseWorld {
  kind: WorldKind;
  name: string;
  suffix: string;
  fits: (goal: GoalKind) => boolean;
  objects: (plan: GoalPlan, robot: BuilderRobot) => WorldObject[];
}

const WALL_GREY = '#6e6e6e';
const WALL_HEIGHT_MM = 200;
const WALL_THICKNESS_MM = 40;
const WALL_OVERHANG_MM = 300;
const BLOCK_HEIGHT_MM = 150;
const BLOCK_DEPTH_MM = 120;
const MIN_SHELF_MM = 10;
const GROUND_GOALS: ReadonlySet<GoalKind> = new Set(['reach', 'push', 'path', 'walk']);

const solid = (id: string, name: string, position: V3, size: V3): WorldObject => ({
  id,
  name,
  kind: 'box',
  position,
  rotation: [0, 0, 0],
  size,
  color: WALL_GREY,
  behavior: 'static',
});

function corridor({ route }: GoalPlan): WorldObject[] {
  const length = Math.abs(route.to[2] - route.from[2]) + WALL_OVERHANG_MM * 2;
  const z = (route.from[2] + route.to[2]) / 2;
  const offset = route.halfWidth + WALL_THICKNESS_MM / 2;
  const size: V3 = [WALL_THICKNESS_MM, WALL_HEIGHT_MM, length];

  return [
    solid('wall-left', 'Left Wall', [route.from[0] + offset, WALL_HEIGHT_MM / 2, z], size),
    solid('wall-right', 'Right Wall', [route.from[0] - offset, WALL_HEIGHT_MM / 2, z], size),
  ];
}

function block({ route }: GoalPlan, robot: BuilderRobot): WorldObject[] {
  const width = Math.min(Math.max(robot.footprint.width * 0.8, 120), 400);
  const z = (route.from[2] + route.to[2]) / 2;

  return [solid('block', 'Block', [route.from[0], BLOCK_HEIGHT_MM / 2, z], [width, BLOCK_HEIGHT_MM, BLOCK_DEPTH_MM])];
}

function shelf({ target }: GoalPlan): WorldObject[] {
  if (!target) return [];

  const top = target.at[1] - target.radius * 1.5;
  const side = target.radius * 4;

  if (top < MIN_SHELF_MM) return [];

  return [solid('shelf', 'Shelf', [target.at[0], top / 2, target.at[2]], [side, top, side])];
}

export const CASE_WORLDS: CaseWorld[] = [
  { kind: 'floor', name: 'Open Floor', suffix: '', fits: () => true, objects: () => [] },
  { kind: 'corridor', name: 'Corridor', suffix: 'in a Corridor', fits: (g) => GROUND_GOALS.has(g), objects: corridor },
  { kind: 'block', name: 'Block', suffix: 'past a Block', fits: (g) => GROUND_GOALS.has(g), objects: block },
  { kind: 'shelf', name: 'Shelf', suffix: 'on a Shelf', fits: (g) => g === 'touch', objects: shelf },
];
