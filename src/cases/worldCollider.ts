import type { V3 } from '../utils/kinematics';
import { groundedPieces, type PieceBox } from './worldGround';
import type { WorldBounds, WorldPiece } from './worldTypes';

export interface Hull {
  positions: Float64Array;
  indices: Uint32Array;
}

export type Decompose = (positions: Float64Array, indices: Uint32Array) => Hull[];

export const MAX_HULLS = 64;
export const MAX_HULL_VERTICES = 96;
export const VOXELS = 150_000;

const FLOOR_BAND_MM = 25;
const FLAT_NORMAL = 0.98;
const MM_PER_M = 1000;
const MIN_THICKNESS_MM = 20;
const ROUND = 10;

export interface WorldMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

const vertexAt = (p: ArrayLike<number>, i: number): V3 => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function isFloor(a: V3, b: V3, c: V3): boolean {
  if ([a, b, c].some((p) => Math.abs(p[1]) > FLOOR_BAND_MM)) return false;

  const n = cross(sub(b, a), sub(c, a));
  const length = Math.hypot(...n);

  return length > 0 && Math.abs(n[1]) / length >= FLAT_NORMAL;
}

export function withoutFloor({ positions, indices }: WorldMesh): { positions: Float64Array; indices: Uint32Array } {
  const remap = new Map<number, number>();
  const kept: number[] = [];
  const out: number[] = [];

  for (let t = 0; t < indices.length; t += 3) {
    const corners = [indices[t], indices[t + 1], indices[t + 2]];
    const [a, b, c] = corners.map((i) => vertexAt(positions, i));

    if (isFloor(a, b, c)) continue;

    for (const i of corners) {
      if (!remap.has(i)) {
        remap.set(i, kept.length / 3);
        kept.push(...vertexAt(positions, i).map((v) => v / MM_PER_M));
      }

      out.push(remap.get(i)!);
    }
  }

  return { positions: new Float64Array(kept), indices: new Uint32Array(out) };
}

const MIN_CELL_M = 0.005;

function voxelEdge(positions: Float64Array): number {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  positions.forEach((v, i) => {
    min[i % 3] = Math.min(min[i % 3], v);
    max[i % 3] = Math.max(max[i % 3], v);
  });

  return Math.cbrt(((max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2])) / VOXELS);
}

export function clustered(positions: Float64Array, indices: Uint32Array): Hull {
  const cell = Math.max(voxelEdge(positions) / 2, MIN_CELL_M);
  const cells = new Map<string, number>();
  const kept: number[] = [];
  const faces = new Set<string>();
  const out: number[] = [];
  const cellOf = (i: number) => {
    const key = [0, 1, 2].map((k) => Math.round(positions[i * 3 + k] / cell)).join();
    const known = cells.get(key);

    if (known !== undefined) return known;

    cells.set(key, kept.length / 3);
    kept.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);

    return kept.length / 3 - 1;
  };

  for (let t = 0; t < indices.length; t += 3) {
    const tri = [cellOf(indices[t]), cellOf(indices[t + 1]), cellOf(indices[t + 2])];
    const key = [...tri].sort((x, y) => x - y).join();

    if (new Set(tri).size < 3 || faces.has(key)) continue;

    faces.add(key);
    out.push(...tri);
  }

  return { positions: new Float64Array(kept), indices: new Uint32Array(out) };
}

const round = (v: number) => Math.round(v * ROUND) / ROUND;

function spread(points: V3[], axis: V3): [number, number] {
  const along = points.map((p) => dot(p, axis));

  return [Math.min(...along), Math.max(...along)];
}

function flatAxis(points: V3[], hull: Hull): V3 | null {
  let best: V3 | null = null;
  let area = 0;

  for (let t = 0; t < hull.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => points[hull.indices[t + k]]);
    const n = cross(sub(b, a), sub(c, a));
    const size = Math.hypot(...n);

    if (size > area) [best, area] = [n.map((x) => x / size) as V3, size];
  }

  if (!best) return null;

  const [lo, hi] = spread(points, best);

  return hi - lo < MIN_THICKNESS_MM ? best : null;
}

function thickened(points: V3[], hull: Hull): V3[] {
  const axis = flatAxis(points, hull);

  if (!axis) return points;

  const half = MIN_THICKNESS_MM / 2;
  const every = Math.ceil((points.length * 2) / MAX_HULL_VERTICES);

  return points
    .filter((_, i) => i % every === 0)
    .flatMap((p) => [p.map((x, i) => x + axis[i] * half) as V3, p.map((x, i) => x - axis[i] * half) as V3]);
}

function boxOf(points: V3[]): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  for (const p of points)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }

  return { min, max };
}

interface Shaped {
  points: V3[];
  top: PieceBox;
}

function shaped(hull: Hull): Shaped {
  const raw = Array.from(
    { length: hull.positions.length / 3 },
    (_, i) => vertexAt(hull.positions, i).map((v) => v * MM_PER_M) as V3,
  );
  const points = thickened(raw, hull);
  const box = boxOf(points);

  return { points, top: box };
}

function pieceOf({ points, top }: Shaped, ground: boolean): WorldPiece {
  const center = top.min.map((v, i) => round((v + top.max[i]) / 2)) as V3;

  return { center, vertices: points.flatMap((p) => p.map((v, i) => round(v - center[i]))), ground };
}

const order = (a: Shaped, b: Shaped) =>
  a.top.min[0] - b.top.min[0] || a.top.min[2] - b.top.min[2] || a.top.min[1] - b.top.min[1];

export function worldPieces(mesh: WorldMesh, decompose: Decompose): WorldPiece[] {
  const solid = withoutFloor(mesh);

  if (solid.indices.length < 3) return [];

  const simple = clustered(solid.positions, solid.indices);

  if (simple.indices.length < 3) return [];

  const hulls = decompose(simple.positions, simple.indices)
    .filter((h) => h.positions.length >= 12 && h.positions.every(Number.isFinite))
    .slice(0, MAX_HULLS)
    .map(shaped)
    .sort(order);
  const ground = groundedPieces(hulls.map((h) => h.top));

  return hulls.map((h, i) => pieceOf(h, ground[i]));
}

export function worldBounds(positions: ArrayLike<number>): WorldBounds {
  const min: [number, number] = [Infinity, Infinity];
  const max: [number, number] = [-Infinity, -Infinity];

  for (let i = 0; i < positions.length; i += 3) {
    min[0] = Math.min(min[0], positions[i]);
    max[0] = Math.max(max[0], positions[i]);
    min[1] = Math.min(min[1], positions[i + 2]);
    max[1] = Math.max(max[1], positions[i + 2]);
  }

  return { min, max };
}
