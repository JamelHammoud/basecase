import type { PortVec } from '../types/ports';
import {
  AXES,
  clearSegment,
  crossesBox,
  corners,
  routeClearance,
  type RouteClearance,
  distance,
  EPSILON,
  expanded,
  finite,
  transformed,
  validBox,
  type RelativeBound,
  type RoutePoint,
  type RouteObstacle,
} from './routeCollision';

export type { RouteObstacle } from './routeCollision';

export interface RouteEndpoint extends RoutePoint {
  axis: PortVec;
}

interface RouteInput {
  from: RouteEndpoint;
  to: RouteEndpoint;
  obstacles: RouteObstacle[];
  anchors?: PortVec[];
  anchorIds?: string[];
  bound?: RelativeBound;
}

const EXIT_MM = 8;
const noMotion: RelativeBound = () => 0;

function ownerExitDistance(endpoint: RouteEndpoint, start: PortVec, owner: RouteObstacle): number {
  const origin = transformed(endpoint.position, owner.inverse);
  const localStart = transformed(start, owner.inverse);

  if (AXES.some((axis) => localStart[axis] < owner.min[axis] || localStart[axis] > owner.max[axis])) return EXIT_MM;

  const distances = AXES.flatMap((axis) => {
    const direction = (localStart[axis] - origin[axis]) / EXIT_MM;

    if (Math.abs(direction) < EPSILON) return [];

    const edge = direction > 0 ? owner.max[axis] : owner.min[axis];

    return [(edge - origin[axis]) / direction];
  });

  return Math.max(EXIT_MM, Math.min(...distances));
}

function exit(endpoint: RouteEndpoint, boxes: RouteObstacle[]): PortVec | null {
  const magnitude = Math.hypot(...endpoint.axis);

  if (!finite(endpoint.position) || !finite(endpoint.axis) || !Number.isFinite(magnitude) || magnitude < EPSILON)
    return null;

  const start = endpoint.position.map((v, axis) => v + (endpoint.axis[axis] * EXIT_MM) / magnitude) as PortVec;
  const owner = boxes.find((box) => box.id === endpoint.obstacleId);
  const length = owner ? ownerExitDistance(endpoint, start, owner) : EXIT_MM;
  const outside = endpoint.position.map((v, axis) => v + (endpoint.axis[axis] * length) / magnitude) as PortVec;

  return finite(outside) ? outside : null;
}

function clearExit(
  endpoint: RouteEndpoint,
  outside: RoutePoint,
  boxes: RouteObstacle[],
  bound: RelativeBound,
): boolean {
  return boxes.every((box) => box.id === endpoint.obstacleId || !crossesBox(endpoint, outside, box, bound));
}

function comparePoints(a: PortVec, b: PortVec): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function routeCorners(obstacles: RouteObstacle[], clearance: RouteClearance): RoutePoint[] {
  const candidates = obstacles
    .flatMap((box) => corners(box).map((position) => ({ position, obstacleId: box.id })))
    .sort((a, b) => comparePoints(a.position, b.position) || a.obstacleId.localeCompare(b.obstacleId));
  const unique = new Map<string, RoutePoint>();

  for (const point of candidates) {
    if (obstacles.some((box) => clearance.crosses(point, point, box))) continue;

    unique.set(point.position.join(','), point);
  }

  return [...unique.values()];
}

function closestUnvisited(distances: number[], visited: Uint8Array): number {
  let closest = -1;
  let minimum = Infinity;

  for (let index = 0; index < distances.length; index++) {
    if (visited[index] || distances[index] >= minimum) continue;

    closest = index;
    minimum = distances[index];
  }

  return closest;
}

function restorePath(points: RoutePoint[], previous: Int32Array): RoutePoint[] {
  const path: RoutePoint[] = [];
  let index = 1;

  while (index >= 0) {
    path.push(points[index]);
    index = previous[index];
  }

  return path.reverse();
}

function shortestPath(input: {
  start: RoutePoint;
  end: RoutePoint;
  obstacles: RouteObstacle[];
  vertices: () => RoutePoint[];
  bound: RelativeBound;
  clearance: () => RouteClearance;
}): RoutePoint[] | null {
  const { start, end, obstacles, vertices, bound, clearance } = input;

  if (clearSegment(start, end, obstacles, bound)) return [start, end];

  const query = clearance();
  const points = [start, end, ...vertices()];
  const distances = points.map(() => Infinity);
  const previous = new Int32Array(points.length).fill(-1);
  const visited = new Uint8Array(points.length);

  distances[0] = 0;

  for (let count = 0; count < points.length; count++) {
    const current = closestUnvisited(distances, visited);

    if (current < 0) return null;

    if (current === 1) return restorePath(points, previous);

    visited[current] = 1;

    for (let next = 0; next < points.length; next++) {
      if (visited[next]) continue;

      const candidate = distances[current] + distance(points[current].position, points[next].position);

      if (candidate >= distances[next] - EPSILON || !query.clear(points[current], points[next], obstacles)) continue;

      distances[next] = candidate;
      previous[next] = current;
    }
  }

  return null;
}

export function routePath({
  from,
  to,
  obstacles,
  anchors = [],
  anchorIds = [],
  bound = noMotion,
}: RouteInput): RoutePoint[] | null {
  if (!obstacles.every(validBox) || !anchors.every(finite)) return null;

  const boxes = obstacles.map(expanded);
  const start = exit(from, boxes);
  const end = exit(to, boxes);

  if (!start || !end) return null;

  const startPoint = { position: start, obstacleId: from.obstacleId };
  const endPoint = { position: end, obstacleId: to.obstacleId };
  const stops = [startPoint, ...anchors.map((position, i) => ({ position, obstacleId: anchorIds[i] })), endPoint];

  if (stops.some((point) => boxes.some((box) => crossesBox(point, point, box, bound)))) return null;

  if (!clearExit(from, startPoint, boxes, bound) || !clearExit(to, endPoint, boxes, bound)) return null;

  let routeVertices: RoutePoint[] | undefined;
  let query: RouteClearance | undefined;
  const clearance = () => (query ??= routeClearance(bound));
  const vertices = () => (routeVertices ??= routeCorners(boxes, clearance()));
  const result: RoutePoint[] = [from, startPoint];

  for (let index = 1; index < stops.length; index++) {
    const segment = shortestPath({
      start: stops[index - 1],
      end: stops[index],
      obstacles: boxes,
      vertices,
      bound,
      clearance,
    });

    if (!segment) return null;

    result.push(...segment.slice(1));
  }

  result.push(to);

  return result;
}

export function routePolyline(input: RouteInput): PortVec[] | null {
  return routePath(input)?.map((point) => [...point.position]) ?? null;
}

function sameCorner(point: PortVec, corner: PortVec): boolean {
  if (
    Math.abs(point[0] - corner[0]) >= EPSILON ||
    Math.abs(point[1] - corner[1]) >= EPSILON ||
    Math.abs(point[2] - corner[2]) >= EPSILON
  )
    return false;

  return distance(point, corner) < EPSILON;
}

export function routeTopology(points: PortVec[], obstacles: RouteObstacle[]): string[] {
  if (points.length <= 4) return [];

  const vertices = obstacles.flatMap((box) =>
    corners(expanded(box)).map((position, bits) => ({ position, label: `${box.id}:${bits}` })),
  );

  return points.slice(2, -2).flatMap((point) => {
    const labels = vertices.filter((vertex) => sameCorner(point, vertex.position)).map((vertex) => vertex.label);

    return labels.length ? [labels.sort().join('|')] : [];
  });
}
