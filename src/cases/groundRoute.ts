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

function leg(a: V3, b: V3, scene: ReturnType<typeof groundObstacles>, depth: number): V3[] {
  const hit = depth < MAX_DETOURS ? scene.blocker(a, b) : undefined;

  if (!hit) return [b];

  const [c1, c2] = around(a, b, hit);

  return [...leg(a, c1, scene, depth + 1), ...leg(c1, c2, scene, depth + 1), ...leg(c2, b, scene, depth + 1)];
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
    route.push(...(point.push ? [point] : leg(from, point.at, scene, 0).map((p) => ({ ...point, at: p }))));
    from = point.at;
  }

  return route;
}
