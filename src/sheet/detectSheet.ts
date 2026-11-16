import { Vector3 } from 'three';
import type { SheetProfile } from '../types/sheet';
import { canonicalLoop, inside, loopsOf } from './profileLoops';
import { CapBoundary } from './capBoundary';
import { pairKey } from '../../electron/cad-kernel/pairKey.mjs';
import { emptyBounds, includePoint } from '../utils/sketch/bounds';

const TOLERANCE_MM = 0.002;
const ANGLE_TOLERANCE = 0.003;

type Face = { vertices: Vector3[]; normal: Vector3; area: number };

function facesOf(triangles: Float32Array): Face[] {
  const faces: Face[] = [];
  const edge = new Vector3();

  for (let i = 0; i < triangles.length; i += 9) {
    const a = new Vector3().fromArray(triangles, i);
    const b = new Vector3().fromArray(triangles, i + 3);
    const c = new Vector3().fromArray(triangles, i + 6);
    const cross = new Vector3().subVectors(b, a).cross(edge.subVectors(c, a));
    const area = cross.length() / 2;

    if (area > 1e-8) faces.push({ vertices: [a, b, c], normal: cross.normalize(), area });
  }

  return faces;
}

function candidateNormals(faces: Face[]): Vector3[] {
  const directions = new Map<string, { normal: Vector3; sum?: Vector3; area: number }>();
  const normal = new Vector3();

  for (const face of faces) {
    normal.copy(face.normal);

    let dominant = Math.abs(normal.y) > Math.abs(normal.x) ? normal.y : normal.x;

    if (Math.abs(normal.z) > Math.abs(dominant)) dominant = normal.z;

    if (dominant < 0) normal.negate();

    const key = `${Math.round(normal.x * 100)},${Math.round(normal.y * 100)},${Math.round(normal.z * 100)}`;
    const found = directions.get(key);

    if (found) {
      found.sum ??= found.normal.clone().multiplyScalar(found.area);
      found.sum.addScaledVector(normal, face.area);
      found.area += face.area;

      continue;
    }

    directions.set(key, { normal: normal.clone(), area: face.area });
  }

  return [...directions.values()]
    .sort((a, b) => b.area - a.area)
    .slice(0, 12)
    .map(({ normal, sum }) => sum?.normalize() ?? normal);
}

function frame(normal: Vector3) {
  const reference = Math.abs(normal.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const u = reference.addScaledVector(normal, -reference.dot(normal)).normalize();
  const v = normal.clone().cross(u);
  const project = (p: Vector3): [number, number] => [p.dot(u), p.dot(v)];

  return { project };
}

function projectedBounds(faces: Face[], normal: Vector3) {
  const ranges = new Float64Array(faces.length * 2);
  let low = Infinity;
  let high = -Infinity;

  for (let i = 0; i < faces.length; i++) {
    const [a, b, c] = faces[i].vertices;
    const x = a.dot(normal);
    const y = b.dot(normal);
    const z = c.dot(normal);
    const min = Math.min(x, y, z);
    const max = Math.max(x, y, z);

    ranges[i * 2] = min;
    ranges[i * 2 + 1] = max;
    low = Math.min(low, min);
    high = Math.max(high, max);
  }

  return { ranges, low, high };
}

function parallelSides(faces: Face[], normal: Vector3, bounds: ReturnType<typeof projectedBounds>): boolean {
  return faces.every(
    (face, i) =>
      bounds.ranges[i * 2 + 1] - bounds.low <= TOLERANCE_MM ||
      bounds.high - bounds.ranges[i * 2] <= TOLERANCE_MM ||
      Math.abs(face.normal.dot(normal)) <= ANGLE_TOLERANCE,
  );
}

function capEdges(faces: Face[], normal: Vector3, bounds: ReturnType<typeof projectedBounds>) {
  const { project } = frame(normal);
  const bottom = new CapBoundary();
  const top = new CapBoundary();

  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    const onBottom = bounds.ranges[i * 2 + 1] - bounds.low <= TOLERANCE_MM;
    const onTop = bounds.high - bounds.ranges[i * 2] <= TOLERANCE_MM;

    if (!onBottom && !onTop) continue;

    const [a, b, c] = face.vertices.map(project);

    if (onBottom) bottom.add(a, b, c);

    if (onTop) top.add(a, b, c);
  }

  return { bottom: bottom.edges(), top: top.edges() };
}

function outlineWidth(outline: SheetProfile['outline']): number {
  const extent = emptyBounds();

  for (const [x, y] of outline) includePoint(extent, x, y);

  return Math.min(extent.max[0] - extent.min[0], extent.max[1] - extent.min[1]);
}

function profileAlong(faces: Face[], normal: Vector3): SheetProfile | undefined {
  const bounds = projectedBounds(faces, normal);
  const { low, high } = bounds;
  const thicknessMm = high - low;

  if (thicknessMm <= TOLERANCE_MM || !parallelSides(faces, normal, bounds)) return undefined;

  const { bottom, top } = capEdges(faces, normal, bounds);

  if (!bottom?.length || !top?.length) return undefined;

  const loops = loopsOf(top);
  const bottomLoops = loopsOf(bottom);

  if (!loops?.length || !bottomLoops?.length || loops.slice(1).some((hole) => !inside(hole[0], loops[0])))
    return undefined;

  const outline = canonicalLoop(loops[0], true);
  const holes = loops.slice(1).map((loop) => canonicalLoop(loop, false));
  const upper = [outline, ...holes];
  const lower = bottomLoops.map((loop, i) => canonicalLoop(loop, i === 0));

  if (upper.length !== lower.length || !upper.every((loop) => lower.some((other) => sameLoop(loop, other))))
    return undefined;

  if (thicknessMm > outlineWidth(outline) + TOLERANCE_MM) return undefined;

  holes.sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1]);

  return {
    thicknessMm,
    outline,
    holes,
    normal: normal.toArray(),
    center: normal
      .clone()
      .multiplyScalar((low + high) / 2)
      .toArray(),
  };
}

export function detectSheet(triangles: Float32Array): SheetProfile | undefined {
  if (!triangles.length || triangles.length % 9 || !triangles.every(Number.isFinite)) return undefined;

  const faces = facesOf(triangles);

  for (const normal of candidateNormals(faces)) {
    const profile = profileAlong(faces, normal);

    if (profile) return closedSolid(faces) ? profile : undefined;
  }

  return undefined;
}

function sameLoop(a: SheetProfile['outline'], b: SheetProfile['outline']): boolean {
  return (
    a.length === b.length && a.every((point, i) => Math.hypot(point[0] - b[i][0], point[1] - b[i][1]) <= TOLERANCE_MM)
  );
}

const vertexKey = (p: Vector3) => `${Math.round(p.x * 10000)},${Math.round(p.y * 10000)},${Math.round(p.z * 10000)}`;

function countEdge(edges: Map<string, number>, a: string, b: string) {
  const edge = pairKey(a, b);

  edges.set(edge, (edges.get(edge) ?? 0) + 1);
}

function closedSolid(faces: Face[]): boolean {
  const edges = new Map<string, number>();

  for (const face of faces) {
    const a = vertexKey(face.vertices[0]);
    const b = vertexKey(face.vertices[1]);
    const c = vertexKey(face.vertices[2]);

    countEdge(edges, a, b);
    countEdge(edges, b, c);
    countEdge(edges, c, a);
  }

  for (const count of edges.values()) {
    if (count !== 2) return false;
  }

  return true;
}
