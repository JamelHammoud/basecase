import type { PortVec } from '../types/ports';

export interface RouteObstacle {
  id: string;
  min: PortVec;
  max: PortVec;
}

export interface RouteEndpoint {
  position: PortVec;
  axis: PortVec;
  obstacleId?: string;
}

interface RouteInput {
  from: RouteEndpoint;
  to: RouteEndpoint;
  obstacles: RouteObstacle[];
  anchors?: PortVec[];
}

const CLEARANCE_MM = 3;
const EXIT_MM = 8;
const EPSILON = 1e-9;
const AXES = [0, 1, 2] as const;
const finite = (point: PortVec) => point.length === 3 && point.every(Number.isFinite);
const distance = (a: PortVec, b: PortVec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const inside = (point: PortVec, box: RouteObstacle) =>
  AXES.every((axis) => point[axis] > box.min[axis] + EPSILON && point[axis] < box.max[axis] - EPSILON);

function expanded(obstacle: RouteObstacle): RouteObstacle {
  return {
    id: obstacle.id,
    min: obstacle.min.map((v) => v - CLEARANCE_MM) as PortVec,
    max: obstacle.max.map((v) => v + CLEARANCE_MM) as PortVec,
  };
}

function validBox(box: RouteObstacle): boolean {
  return finite(box.min) && finite(box.max) && AXES.every((axis) => box.min[axis] <= box.max[axis]);
}

function exit(endpoint: RouteEndpoint): PortVec | null {
  const magnitude = Math.hypot(...endpoint.axis);

  if (!finite(endpoint.position) || !finite(endpoint.axis) || magnitude < EPSILON) return null;

  return endpoint.position.map((v, axis) => v + (endpoint.axis[axis] * EXIT_MM) / magnitude) as PortVec;
}

function crossesBox(start: PortVec, end: PortVec, box: RouteObstacle): boolean {
  let enter = 0;
  let leave = 1;

  for (const axis of AXES) {
    const direction = end[axis] - start[axis];
    const minimum = box.min[axis] + EPSILON;
    const maximum = box.max[axis] - EPSILON;

    if (Math.abs(direction) < EPSILON && (start[axis] <= minimum || start[axis] >= maximum)) {
      return false;
    }

    if (Math.abs(direction) < EPSILON) continue;

    const first = (minimum - start[axis]) / direction;
    const last = (maximum - start[axis]) / direction;

    enter = Math.max(enter, Math.min(first, last));
    leave = Math.min(leave, Math.max(first, last));

    if (leave <= enter) return false;
  }

  return leave > enter;
}

const clearSegment = (start: PortVec, end: PortVec, obstacles: RouteObstacle[]) =>
  obstacles.every((box) => !crossesBox(start, end, box));

function clearExit(endpoint: RouteEndpoint, outside: PortVec, boxes: RouteObstacle[]): boolean {
  return boxes.every((box) => box.id === endpoint.obstacleId || !crossesBox(endpoint.position, outside, box));
}

function corners(box: RouteObstacle): PortVec[] {
  return Array.from({ length: 8 }, (_, bits) => [
    bits & 1 ? box.max[0] : box.min[0],
    bits & 2 ? box.max[1] : box.min[1],
    bits & 4 ? box.max[2] : box.min[2],
  ]);
}

function comparePoints(a: PortVec, b: PortVec): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function routeCorners(obstacles: RouteObstacle[]): PortVec[] {
  const candidates = obstacles.flatMap(corners).sort(comparePoints);
  const unique = new Map<string, PortVec>();

  for (const point of candidates) {
    if (obstacles.some((box) => inside(point, box))) continue;

    unique.set(point.join(','), point);
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

function restorePath(points: PortVec[], previous: Int32Array): PortVec[] {
  const path: PortVec[] = [];
  let index = 1;

  while (index >= 0) {
    path.push([...points[index]]);
    index = previous[index];
  }

  return path.reverse();
}

function shortestPath(start: PortVec, end: PortVec, obstacles: RouteObstacle[], vertices: PortVec[]): PortVec[] | null {
  if (clearSegment(start, end, obstacles)) return [[...start], [...end]];

  const points = [start, end, ...vertices];
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

      const candidate = distances[current] + distance(points[current], points[next]);

      if (candidate >= distances[next] - EPSILON || !clearSegment(points[current], points[next], obstacles)) continue;

      distances[next] = candidate;
      previous[next] = current;
    }
  }

  return null;
}

export function routePolyline({ from, to, obstacles, anchors = [] }: RouteInput): PortVec[] | null {
  const start = exit(from);
  const end = exit(to);

  if (!start || !end || !obstacles.every(validBox) || !anchors.every(finite)) return null;

  const boxes = obstacles.map(expanded);
  const stops = [start, ...anchors, end];

  if (stops.some((point) => boxes.some((box) => inside(point, box)))) return null;

  if (!clearExit(from, start, boxes) || !clearExit(to, end, boxes)) return null;

  const vertices = routeCorners(boxes);
  const result: PortVec[] = [[...from.position], [...start]];

  for (let index = 1; index < stops.length; index++) {
    const segment = shortestPath(stops[index - 1], stops[index], boxes, vertices);

    if (!segment) return null;

    result.push(...segment.slice(1));
  }

  result.push([...to.position]);

  return result;
}

export function routeTopology(points: PortVec[], obstacles: RouteObstacle[]): string[] {
  const vertices = obstacles.flatMap((box) =>
    corners(expanded(box)).map((position, bits) => ({ position, label: `${box.id}:${bits}` })),
  );

  return points.slice(2, -2).flatMap((point) => {
    const labels = vertices
      .filter((vertex) => distance(point, vertex.position) < EPSILON)
      .map((vertex) => vertex.label);

    return labels.length ? [labels.sort().join('|')] : [];
  });
}
