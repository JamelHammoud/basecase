import type { V3 } from '../utils/kinematics';
import { routeClearance, type BuilderRobot, type GoalKind } from './caseGoals';
import type { CaseWorld } from './caseWorlds';
import { occupied } from './groundRoute';
import type { Room } from './roomPlan';
import { largest } from './roomWalls';
import { MAX_OBJECTS, type WorldObject } from './schema';

const ROOM_GROUND_GOALS: ReadonlySet<GoalKind> = new Set(['reach', 'push', 'path']);
const MIN_STEP_MM = 50;
const STEPS_ACROSS = 200;
const TABLE_HEIGHT_MM: [number, number] = [400, 1100];

interface Bounds {
  min: [number, number];
  max: [number, number];
}

function boundsOf(objects: WorldObject[]): Bounds {
  const walls = objects.filter((o) => o.name === 'Wall');
  const from = walls.length ? walls : objects;
  const xs = from.flatMap((o) => [o.position[0] - o.size[0] / 2, o.position[0] + o.size[0] / 2]);
  const zs = from.flatMap((o) => [o.position[2] - o.size[2] / 2, o.position[2] + o.size[2] / 2]);

  return { min: [Math.min(...xs), Math.min(...zs)], max: [Math.max(...xs), Math.max(...zs)] };
}

function floorSpots({ min, max }: Bounds, clearanceMm: number): V3[] {
  const step = Math.max(MIN_STEP_MM, Math.max(max[0] - min[0], max[1] - min[1]) / STEPS_ACROSS);
  const centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
  const spots: V3[] = [];

  for (let x = min[0] + clearanceMm; x <= max[0] - clearanceMm; x += step)
    for (let z = min[1] + clearanceMm; z <= max[1] - clearanceMm; z += step) spots.push([x, 0, z]);

  const away = (p: V3) => Math.hypot(p[0] - centre[0], p[2] - centre[1]);

  return [[centre[0], 0, centre[1]] as V3, ...spots.sort((a, b) => away(a) - away(b))];
}

export function openSpot(room: Room, clearanceMm: number): V3 {
  const solid = room.objects.filter((o) => o.behavior !== 'marker');
  const spots = floorSpots(boundsOf(room.objects), clearanceMm);

  return spots.find((p) => !occupied(p, solid, clearanceMm)) ?? spots[0];
}

export function placedRoom(room: Room, robot: BuilderRobot): WorldObject[] {
  const spot = openSpot(room, routeClearance(robot));
  const dx = robot.pivot[0] - spot[0];
  const dz = robot.pivot[2] - spot[2];

  return room.objects.map((o) => ({ ...o, position: [o.position[0] + dx, o.position[1], o.position[2] + dz] }));
}

function distanceToBox(p: V3, o: WorldObject): number {
  const gap = p.map((x, i) => Math.max(Math.abs(x - o.position[i]) - o.size[i] / 2, 0));

  return Math.hypot(...gap);
}

const tableHeight = (o: WorldObject) => {
  const top = o.position[1] + o.size[1] / 2;

  return o.behavior === 'static' && o.name !== 'Wall' && top >= TABLE_HEIGHT_MM[0] && top <= TABLE_HEIGHT_MM[1];
};

export function tableInReach(room: Room, robot: BuilderRobot): boolean {
  const { anchor, reachMm } = robot.facts;

  if (!reachMm) return false;

  return placedRoom(room, robot).some((o) => tableHeight(o) && distanceToBox(anchor, o) <= reachMm);
}

export function roomWorld(room: Room): CaseWorld {
  return {
    kind: 'room',
    name: room.name,
    suffix: `in ${room.name}`,
    trueSize: true,
    fits: (goal, robot) => ROOM_GROUND_GOALS.has(goal) || (goal === 'touch' && !!robot && tableInReach(room, robot)),
    objects: (plan, robot) => largest(placedRoom(room, robot), MAX_OBJECTS - plan.objects.length),
  };
}
