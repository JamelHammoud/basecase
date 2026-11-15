import type { V3 } from '../utils/kinematics';
import type { WorldHull } from './worldDecomposition';
import { coversFloorPoint, prepareFloorTriangle, type FloorTriangle } from './floorTriangle';

export interface SurfaceBounds {
  min: V3;
  max: V3;
}

interface Surface {
  index: number;
  bounds: SurfaceBounds;
}

export const FLOOR_TOLERANCE_MM = 1;

const MAX_STEP_MM = 200;
const MAX_SLOPE_DEG = 40;
const SLOPE_NORMAL = Math.cos((MAX_SLOPE_DEG * Math.PI) / 180);
const CELL_MM = 200;
const MAX_TRIANGLE_CELLS = 64;

type Triangle = [V3, V3, V3];

const faceCache = new WeakMap<WorldHull, Triangle[]>();

export function hullBounds(positions: ArrayLike<number>): SurfaceBounds {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3;

    min[axis] = Math.min(min[axis], positions[i]);
    max[axis] = Math.max(max[axis], positions[i]);
  }

  return { min, max };
}

function topFaces(piece: WorldHull): Triangle[] {
  const known = faceCache.get(piece);

  if (known) return known;

  const centre = [0, 0, 0];
  const vertices = piece.positions.length / 3;

  for (let i = 0; i < piece.positions.length; i++) centre[i % 3] += piece.positions[i] / vertices;

  const triangles: Triangle[] = [];

  for (let i = 0; i < piece.indices.length; i += 3) {
    const triangle = [...piece.indices.slice(i, i + 3)].map((index) =>
      Array.from(piece.positions.slice(index * 3, index * 3 + 3)),
    ) as Triangle;
    const [a, b, c] = triangle;
    const u = b.map((v, axis) => v - a[axis]);
    const v = c.map((value, axis) => value - a[axis]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const outward = normal.reduce((sum, value, axis) => sum + value * (a[axis] - centre[axis]), 0);
    const vertical = Math.abs(outward) <= 1e-9 ? Math.abs(normal[1]) : normal[1] * Math.sign(outward);
    const up = vertical / Math.hypot(...normal);

    if (up >= SLOPE_NORMAL) triangles.push(triangle);
  }

  faceCache.set(piece, triangles);

  return triangles;
}

const flatFloor = (triangle: Triangle) => triangle.every((p) => Math.abs(p[1]) <= FLOOR_TOLERANCE_MM);

function cellsOf(triangle: Triangle): string[] {
  const { min, max } = hullBounds(triangle.flat());
  const low = [Math.floor(min[0] / CELL_MM), Math.floor(min[2] / CELL_MM)];
  const high = [Math.floor(max[0] / CELL_MM), Math.floor(max[2] / CELL_MM)];

  if ((high[0] - low[0] + 1) * (high[1] - low[1] + 1) > MAX_TRIANGLE_CELLS) return [];

  const cells: string[] = [];

  for (let x = low[0]; x <= high[0]; x++) for (let z = low[1]; z <= high[1]; z++) cells.push(`${x}|${z}`);

  return cells;
}

export function floorSupport(pieces: WorldHull[]): (point: V3) => boolean {
  const large: FloorTriangle[] = [];
  const cells = new Map<string, FloorTriangle[]>();

  for (const triangle of pieces.flatMap(topFaces).filter(flatFloor)) {
    const keys = cellsOf(triangle);
    const floor = prepareFloorTriangle(triangle);

    if (!keys.length) large.push(floor);

    for (const key of keys) cells.set(key, [...(cells.get(key) ?? []), floor]);
  }

  return (point) => {
    const nearby = cells.get(`${Math.floor(point[0] / CELL_MM)}|${Math.floor(point[2] / CELL_MM)}`);

    return (
      large.some((triangle) => coversFloorPoint(point, triangle)) ||
      (nearby?.some((triangle) => coversFloorPoint(point, triangle)) ?? false)
    );
  };
}

function adjacent(a: SurfaceBounds, b: SurfaceBounds): boolean {
  return (
    a.min[0] <= b.max[0] + FLOOR_TOLERANCE_MM &&
    a.max[0] >= b.min[0] - FLOOR_TOLERANCE_MM &&
    a.min[2] <= b.max[2] + FLOOR_TOLERANCE_MM &&
    a.max[2] >= b.min[2] - FLOOR_TOLERANCE_MM &&
    a.min[1] <= b.max[1] + MAX_STEP_MM &&
    a.max[1] >= b.min[1] - MAX_STEP_MM
  );
}

export function terrainPieces(pieces: WorldHull[]): Set<number> {
  const surfaces: Surface[] = pieces.flatMap((piece, index) => {
    const points = topFaces(piece).flat(2);

    return points.length ? [{ index, bounds: hullBounds(points) }] : [];
  });
  const connected = surfaces.filter(({ bounds }) => bounds.min[1] <= FLOOR_TOLERANCE_MM);
  const found = new Set(connected.map(({ index }) => index));

  for (const current of connected) {
    const next = surfaces.filter((surface) => !found.has(surface.index) && adjacent(current.bounds, surface.bounds));

    for (const surface of next) found.add(surface.index);

    connected.push(...next);
  }

  return found;
}
