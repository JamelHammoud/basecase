import { RECOVERY_ERRORS } from './recoveryErrors';
import { Triangle, Vector3 } from 'three';
import { pairKey } from '../../../electron/cad-kernel/pairKey.mjs';
import { RECOVERY_LIMITS } from './recoveryTopology';

const keyOf = (p: Vector3) => `${Math.round(p.x * 10000)},${Math.round(p.y * 10000)},${Math.round(p.z * 10000)}`;
const vector = (soup: Float32Array, i: number) => new Vector3().fromArray(soup, i);

type Edge = { a: Vector3; b: Vector3; count: number };

function edgeData(soup: Float32Array) {
  const edges = new Map<string, Edge>();
  const points = new Map<string, Vector3>();

  for (let i = 0; i < soup.length; i += 9) {
    const triangle = [vector(soup, i), vector(soup, i + 3), vector(soup, i + 6)];

    for (let j = 0; j < 3; j++) {
      const a = triangle[j];
      const b = triangle[(j + 1) % 3];
      const from = keyOf(a);
      const to = keyOf(b);
      const key = pairKey(from, to);
      const found = edges.get(key);

      points.set(from, a);

      if (found) found.count++;
      else edges.set(key, { a, b, count: 1 });
    }
  }

  return { edges, points };
}

function splitPoints(edge: Edge, points: Map<string, Vector3>) {
  const direction = edge.b.clone().sub(edge.a);
  const lengthSq = direction.lengthSq();
  const probe = new Vector3();
  const found: Array<{ t: number; p: Vector3 }> = [];

  for (const p of points.values()) {
    const t = probe.copy(p).sub(edge.a).dot(direction) / lengthSq;

    if (t <= 1e-7 || t >= 1 - 1e-7) continue;

    if (probe.copy(edge.a).addScaledVector(direction, t).distanceTo(p) <= 0.00005) found.push({ t, p });
  }

  return found.sort((a, b) => a.t - b.t).map(({ p }) => p);
}

function appendTriangle(output: number[], points: Vector3[]) {
  for (const p of points) output.push(p.x, p.y, p.z);
}

function appendConformed(output: number[], triangle: Triangle, splits: Map<string, Vector3[]>) {
  const points = [triangle.a, triangle.b, triangle.c];
  const boundary: Vector3[] = [];

  for (let j = 0; j < 3; j++) {
    const a = points[j];
    const b = points[(j + 1) % 3];
    const between = splits.get(pairKey(keyOf(a), keyOf(b))) ?? [];
    const ordered = between.slice().sort((p, q) => p.distanceToSquared(a) - q.distanceToSquared(a));

    boundary.push(a, ...ordered);
  }

  if (boundary.length === 3) return appendTriangle(output, points);

  const center = triangle.getMidpoint(new Vector3());

  for (let j = 0; j < boundary.length; j++)
    appendTriangle(output, [center, boundary[j], boundary[(j + 1) % boundary.length]]);
}

export function conformRecoveryTriangles(soup: Float32Array): Float32Array {
  if (soup.length % 9 || soup.length / 9 > RECOVERY_LIMITS.triangles || !soup.every(Number.isFinite))
    throw new Error(RECOVERY_ERRORS.geometry);

  const { edges, points } = edgeData(soup);
  const unmatched = [...edges.entries()].filter(([, edge]) => edge.count === 1);

  if (!unmatched.length) return soup;

  if (unmatched.length > 256) throw new Error(RECOVERY_ERRORS.geometry);

  const splits = new Map(unmatched.map(([key, edge]) => [key, splitPoints(edge, points)]));
  const output: number[] = [];
  const triangle = new Triangle();

  for (let i = 0; i < soup.length; i += 9) {
    triangle.a.fromArray(soup, i);
    triangle.b.fromArray(soup, i + 3);
    triangle.c.fromArray(soup, i + 6);
    appendConformed(output, triangle, splits);

    if (output.length / 9 > RECOVERY_LIMITS.triangles) throw new Error(RECOVERY_ERRORS.limit);
  }

  return Float32Array.from(output);
}
