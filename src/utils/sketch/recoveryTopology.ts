import { RECOVERY_ERRORS } from './recoveryErrors';
import { Triangle, Vector3 } from 'three';
import { pairKey } from '../../../electron/cad-kernel/pairKey.mjs';

export const RECOVERY_LIMITS = { triangles: 20000, points: 512, coordinateMm: 10000, deviationMm: 0.005 };

const keyOf = (point: Vector3) =>
  `${Math.round(point.x * 10000)},${Math.round(point.y * 10000)},${Math.round(point.z * 10000)}`;

export function recoveryTopology(soup: Float32Array): number {
  if (!soup.length || soup.length % 9 || soup.length / 9 > RECOVERY_LIMITS.triangles)
    throw new Error(RECOVERY_ERRORS.limit);

  const edges = new Map<string, { from: string; to: string; face: number; other?: number }>();
  const vertices = new Set<string>();
  const neighbors: number[][] = Array.from({ length: soup.length / 9 }, () => []);
  const triangle = new Triangle();

  for (let i = 0; i < soup.length; i += 9) {
    triangle.a.fromArray(soup, i);
    triangle.b.fromArray(soup, i + 3);
    triangle.c.fromArray(soup, i + 6);

    const points = [triangle.a, triangle.b, triangle.c];

    if (
      points.some(
        (p) => !p.toArray().every((v) => Number.isFinite(v) && Math.abs(v) <= RECOVERY_LIMITS.coordinateMm),
      ) ||
      triangle.getArea() < 1e-10
    )
      throw new Error(RECOVERY_ERRORS.geometry);

    const keys = points.map(keyOf);

    keys.forEach((key) => vertices.add(key));

    for (let j = 0; j < 3; j++) connectEdge({ edges, neighbors, from: keys[j], to: keys[(j + 1) % 3], face: i / 9 });
  }

  if ([...edges.values()].some((edge) => edge.other === undefined)) throw new Error(RECOVERY_ERRORS.geometry);

  const visited = new Set([0]);
  const pending = [0];

  while (pending.length) {
    const face = pending.pop()!;

    for (const next of neighbors[face]) visitFace(next, visited, pending);
  }

  if (visited.size !== neighbors.length) throw new Error(RECOVERY_ERRORS.geometry);

  const holes = (2 - (vertices.size - edges.size + neighbors.length)) / 2;

  if (!Number.isInteger(holes) || holes < 0) throw new Error(RECOVERY_ERRORS.geometry);

  return holes;
}

function visitFace(next: number, visited: Set<number>, pending: number[]) {
  if (visited.has(next)) return;

  visited.add(next);
  pending.push(next);
}

function connectEdge({
  edges,
  neighbors,
  from,
  to,
  face,
}: {
  edges: Map<string, { from: string; to: string; face: number; other?: number }>;
  neighbors: number[][];
  from: string;
  to: string;
  face: number;
}) {
  const key = pairKey(from, to);
  const edge = edges.get(key);

  if (!edge) {
    edges.set(key, { from, to, face });

    return;
  }

  if (edge.other !== undefined || edge.from !== to || edge.to !== from) throw new Error(RECOVERY_ERRORS.geometry);

  edge.other = face;
  neighbors[face].push(edge.face);
  neighbors[edge.face].push(face);
}
