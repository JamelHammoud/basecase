import { RECOVERY_ERRORS } from './recoveryErrors';
import { Box3, BufferAttribute, BufferGeometry, Triangle, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { measureTriangles } from '../../three/meshMeasure';
import { conformRecoveryTriangles } from './recoveryConform';
import { recoveryTopology, RECOVERY_LIMITS } from './recoveryTopology';
import type { Vec2 } from './types';

const TOLERANCE = RECOVERY_LIMITS.deviationMm;
const cross = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const area = (polygon: Vec2[]) =>
  Math.abs(
    polygon.reduce((sum, p, i) => {
      const q = polygon[(i + 1) % polygon.length];

      return sum + p[0] * q[1] - p[1] * q[0];
    }, 0),
  ) / 2;

function clip(polygon: Vec2[], a: Vec2, b: Vec2): Vec2[] {
  const output: Vec2[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    const from = cross(a, b, p);
    const to = cross(a, b, q);

    if (from >= 0) output.push(p);

    if (from < 0 === to < 0) continue;

    const t = from / (from - to);

    output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
  }

  return output;
}

function projectedOverlap(source: Triangle, target: Triangle, normal: Vector3): number {
  const u = new Vector3().subVectors(source.b, source.a).normalize();
  const v = new Vector3().crossVectors(normal, u);
  const project = (p: Vector3): Vec2 => {
    const relative = new Vector3().subVectors(p, source.a);

    return [relative.dot(u), relative.dot(v)];
  };
  const boundary = [source.a, source.b, source.c].map(project);
  let polygon = [target.a, target.b, target.c].map(project);

  for (let i = 0; i < 3 && polygon.length; i++) polygon = clip(polygon, boundary[i], boundary[(i + 1) % 3]);

  return area(polygon);
}

function surfaceCoverage(source: Float32Array, target: Float32Array): number {
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(target.slice(), 3));
  const tree = new MeshBVH(geometry);
  const triangle = new Triangle();
  const normal = new Vector3();
  const box = new Box3();
  let deviation = 0;

  try {
    for (let i = 0; i < source.length; i += 9) {
      triangle.a.fromArray(source, i);
      triangle.b.fromArray(source, i + 3);
      triangle.c.fromArray(source, i + 6);
      triangle.getNormal(normal);

      const points = [triangle.a, triangle.b, triangle.c];

      box.setFromPoints(points).expandByScalar(TOLERANCE);

      for (const point of points) deviation = Math.max(deviation, tree.closestPointToPoint(point)!.distance);

      let covered = 0;

      tree.shapecast({
        intersectsBounds: (bounds) => bounds.intersectsBox(box),
        intersectsTriangle: (candidate) => {
          const quality = (t: Triangle) =>
            t.getArea() / Math.max(t.a.distanceToSquared(t.b), t.b.distanceToSquared(t.c), t.c.distanceToSquared(t.a));
          const reference = quality(triangle) >= quality(candidate) ? triangle : candidate;
          const other = reference === triangle ? candidate : triangle;
          const planeNormal = reference.getNormal(new Vector3());
          const distances = [other.a, other.b, other.c].map((p) =>
            Math.abs(planeNormal.dot(new Vector3().subVectors(p, reference.a))),
          );

          if (distances.some((d) => d > TOLERANCE)) return;

          covered += projectedOverlap(triangle, candidate, normal);
        },
      });

      const perimeter =
        triangle.a.distanceTo(triangle.b) + triangle.b.distanceTo(triangle.c) + triangle.c.distanceTo(triangle.a);

      if (Math.abs(covered - triangle.getArea()) > Math.max(1e-5, triangle.getArea() * 1e-5, perimeter * 0.0001))
        throw new Error(RECOVERY_ERRORS.reconstruction);
    }
  } finally {
    geometry.dispose();
  }

  return deviation;
}

export function compareRecovery(originalInput: Float32Array, regeneratedInput: Float32Array) {
  const original = conformRecoveryTriangles(originalInput);
  const regenerated = conformRecoveryTriangles(regeneratedInput);
  const holes = recoveryTopology(original);

  if (recoveryTopology(regenerated) !== holes) throw new Error(RECOVERY_ERRORS.reconstruction);

  const before = measureTriangles(original);
  const after = measureTriangles(regenerated);
  const volumeDeviationMm3 = Math.abs(before.volumeMm3 - after.volumeMm3);

  if (volumeDeviationMm3 > Math.max(0.001, before.volumeMm3 * 1e-5, before.areaMm2 * 0.0001))
    throw new Error(RECOVERY_ERRORS.reconstruction);

  const deviationMm = Math.max(surfaceCoverage(original, regenerated), surfaceCoverage(regenerated, original));

  if (deviationMm > TOLERANCE) throw new Error(RECOVERY_ERRORS.reconstruction);

  return { deviationMm, volumeDeviationMm3, holes };
}
