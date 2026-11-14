import type { V3 } from '../utils/kinematics';
import type { WorldObject } from './schema';
import { topOf } from './terrain';

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const MAX_DETOURS = 6;
const CORNER_PAD = 1.15;
const STRAIGHT_ROTATION = 1e-6;

function rectOf(o: WorldObject, inflate: number): Rect {
  const square = o.rotation.some((r) => Math.abs(r) > STRAIGHT_ROTATION);
  const span = Math.hypot(o.size[0], o.size[2]) / 2;
  const halfX = (square ? span : o.size[0] / 2) + inflate;
  const halfZ = (square ? span : o.size[2] / 2) + inflate;

  return {
    minX: o.position[0] - halfX,
    maxX: o.position[0] + halfX,
    minZ: o.position[2] - halfZ,
    maxZ: o.position[2] + halfZ,
  };
}

function slab(start: number, delta: number, min: number, max: number): [number, number] {
  if (Math.abs(delta) < 1e-9) return start > min && start < max ? [0, 1] : [1, 0];

  const t1 = (min - start) / delta;
  const t2 = (max - start) / delta;

  return [Math.min(t1, t2), Math.max(t1, t2)];
}

function crosses(a: V3, b: V3, r: Rect): boolean {
  const [x0, x1] = slab(a[0], b[0] - a[0], r.minX, r.maxX);
  const [z0, z1] = slab(a[2], b[2] - a[2], r.minZ, r.maxZ);

  return Math.max(0, x0, z0) < Math.min(1, x1, z1);
}

const length = (points: V3[]) =>
  points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[2] - points[i][2]), 0);

function around(a: V3, b: V3, r: Rect): V3[] {
  const padX = ((r.maxX - r.minX) * (CORNER_PAD - 1)) / 2;
  const padZ = ((r.maxZ - r.minZ) * (CORNER_PAD - 1)) / 2;
  const [first, last] = b[2] >= a[2] ? [r.minZ - padZ, r.maxZ + padZ] : [r.maxZ + padZ, r.minZ - padZ];
  const sides = [r.minX - padX, r.maxX + padX].map((x): V3[] => [
    [x, a[1], first],
    [x, a[1], last],
  ]);

  return sides.reduce((best, side) => (length([a, ...side, b]) < length([a, ...best, b]) ? side : best));
}

const inside = (p: V3, r: Rect) => p[0] > r.minX && p[0] < r.maxX && p[2] > r.minZ && p[2] < r.maxZ;

export const occupied = (p: V3, objects: WorldObject[], clearanceMm: number) =>
  objects.some((o) => inside(p, rectOf(o, clearanceMm)));

const below = (o: WorldObject, headroomMm: number) => o.position[1] - o.size[1] / 2 < headroomMm;

const INFLATE_STEPS = [1, 0.5, 0.25, 0];

interface Leg {
  obstacles: WorldObject[];
  clearanceMm: number;
}

function blocker(a: V3, b: V3, { obstacles, clearanceMm }: Leg): Rect | undefined {
  for (const o of obstacles) {
    const rect = INFLATE_STEPS.map((k) => rectOf(o, clearanceMm * k)).find((r) => !inside(a, r) && !inside(b, r));

    if (rect && crosses(a, b, rect)) return rect;
  }

  return undefined;
}

function leg(a: V3, b: V3, scene: Leg, depth: number): V3[] {
  const hit = depth < MAX_DETOURS ? blocker(a, b, scene) : undefined;

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
  const scene: Leg = { obstacles, clearanceMm: robot.clearanceMm };
  const route: RoutePoint[] = [];
  let from = robot.start;

  for (const point of waypoints) {
    route.push(...(point.push ? [point] : leg(from, point.at, scene, 0).map((p) => ({ ...point, at: p }))));
    from = point.at;
  }

  return route;
}
