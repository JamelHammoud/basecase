import { Vector3 } from 'three';
import type { SheetProfile } from '../types/sheet';
import { canonicalLoop, inside, loopsOf } from './profileLoops';
import { CapBoundary } from './capBoundary';
import { pairKey } from '../../electron/cad-kernel/pairKey.mjs';

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
  const directions = new Map<string, { normal: Vector3; sum: Vector3; area: number }>();

  for (const face of faces) {
    const normal = face.normal.clone();
    const values = normal.toArray();
    const dominant = values.reduce((best, value, i) => (Math.abs(value) > Math.abs(values[best]) ? i : best), 0);

    if (values[dominant] < 0) normal.negate();

    const key = normal
      .toArray()
      .map((value) => Math.round(value * 100))
      .join(',');
    const found = directions.get(key);

    if (found) {
      found.sum.addScaledVector(normal, face.area);
      found.area += face.area;
      found.normal.copy(found.sum).normalize();

      continue;
    }

    directions.set(key, { normal, sum: normal.clone().multiplyScalar(face.area), area: face.area });
  }

  return [...directions.values()]
    .sort((a, b) => b.area - a.area)
    .slice(0, 12)
    .map(({ normal }) => normal);
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

  const extent = [0, 1].map(
    (axis) => Math.max(...outline.map((p) => p[axis])) - Math.min(...outline.map((p) => p[axis])),
  );

  if (thicknessMm > Math.min(...extent) + TOLERANCE_MM) return undefined;

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

function closedSolid(faces: Face[]): boolean {
  const edges = new Map<string, number>();
  const keyOf = (p: Vector3) =>
    p
      .toArray()
      .map((n) => Math.round(n * 10000))
      .join(',');

  for (const face of faces) {
    const points = face.vertices.map(keyOf);

    for (let i = 0; i < 3; i++) {
      const edge = pairKey(points[i], points[(i + 1) % 3]);

      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }

  return [...edges.values()].every((count) => count === 2);
}
