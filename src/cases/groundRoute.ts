import type { V3 } from '../utils/kinematics';
import type { WorldObject } from './schema';
import { topOf } from './terrain';
import { groundObstacles, type GroundRect } from './groundObstacles';

const MAX_DETOURS = 6;
const CORNER_PAD = 1.15;

const length = (points: V3[]) =>
  points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[2] - points[i][2]), 0);

function around(a: V3, b: V3, r: GroundRect): V3[] {
  const padX = ((r.maxX - r.minX) * (CORNER_PAD - 1)) / 2;
  const padZ = ((r.maxZ - r.minZ) * (CORNER_PAD - 1)) / 2;
  const [first, last] = b[2] >= a[2] ? [r.minZ - padZ, r.maxZ + padZ] : [r.maxZ + padZ, r.minZ - padZ];
  const sides = [r.minX - padX, r.maxX + padX].map((x): V3[] => [
    [x, a[1], first],
    [x, a[1], last],
  ]);

  return sides.reduce((best, side) => (length([a, ...side, b]) < length([a, ...best, b]) ? side : best));
}

const below = (o: WorldObject, headroomMm: number) => o.position[1] - o.size[1] / 2 < headroomMm;

interface RouteLeg {
  scene: ReturnType<typeof groundObstacles>;
  point: RoutePoint;
  route: RoutePoint[];
}

function appendLeg(a: V3, b: V3, depth: number, context: RouteLeg): void {
  const { scene, point, route } = context;
  const hit = depth < MAX_DETOURS ? scene.blocker(a, b) : undefined;

  if (!hit) {
    route.push({ ...point, at: b });

    return;
  }

  const [c1, c2] = around(a, b, hit);

  appendLeg(a, c1, depth + 1, context);
  appendLeg(c1, c2, depth + 1, context);
  appendLeg(c2, b, depth + 1, context);
}

export interface RouteRobot {
  start: V3;
  clearanceMm: number;
  headroomMm?: number;
  stepMm?: number;
}

export interface RoutePoint {
  at: V3;
  speed?: number;
  push?: string;
}

export function groundRoute(waypoints: RoutePoint[], objects: WorldObject[], robot: RouteRobot): RoutePoint[] {
  const headroom = robot.headroomMm ?? Infinity;
  const step = robot.stepMm ?? -Infinity;
  const obstacles = objects.filter((o) => o.behavior === 'static' && below(o, headroom) && topOf(o) > step);
  const scene = groundObstacles(obstacles, robot.clearanceMm);
  const route: RoutePoint[] = [];
  let from = robot.start;

  for (const point of waypoints) {
    if (point.push) route.push(point);
    else appendLeg(from, point.at, 0, { scene, point, route });

    from = point.at;
  }

  return route;
}
