import { Vector3 } from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { CaseFileError } from './validate';
import type { CollisionMesh } from './worldComponents';

export function clipWorldHull(positions: Float64Array, source: CollisionMesh): Float32Array {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < source.positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], source.positions[i]);
    max[i % 3] = Math.max(max[i % 3], source.positions[i]);
  }

  return Float32Array.from(positions, (value, index) => Math.max(min[index % 3], Math.min(max[index % 3], value)));
}

function pointsOf(positions: Float32Array): Vector3[] {
  const seen = new Set<string>();
  const points: Vector3[] = [];

  for (let i = 0; i < positions.length; i += 3) {
    const key = `${positions[i]},${positions[i + 1]},${positions[i + 2]}`;

    if (seen.has(key)) continue;

    seen.add(key);
    points.push(new Vector3(positions[i], positions[i + 1], positions[i + 2]));
  }

  return points;
}

function planeNormal(points: Vector3[]): Vector3 {
  const normal = new Vector3();
  const baseline = new Vector3().subVectors(points[1], points[0]);

  for (let i = 2; i < points.length; i++) {
    normal.crossVectors(baseline, new Vector3().subVectors(points[i], points[0]));

    if (normal.lengthSq() > 1e-12) return normal.normalize();
  }

  throw new CaseFileError('World collision surface needs an area.');
}

function fromConvexPoints(points: Vector3[]): CollisionMesh {
  const hull = new ConvexHull().setFromPoints(points);
  const vertices = new Map<Vector3, number>();
  const positions: number[] = [];
  const indices: number[] = [];

  for (const face of hull.faces) {
    let edge = face.edge;

    do {
      const point = edge.head().point;
      const index = vertices.get(point) ?? vertices.size;

      if (!vertices.has(point)) {
        vertices.set(point, index);
        positions.push(point.x, point.y, point.z);
      }

      indices.push(index);
      edge = edge.next;
    } while (edge !== face.edge);
  }

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

export function solidWorldHull(mesh: CollisionMesh): CollisionMesh {
  const points = pointsOf(mesh.positions);

  if (points.length < 3) throw new CaseFileError('World collision surface needs three different points.');

  const normal = planeNormal(points);
  const origin = normal.dot(points[0]);
  const distances = points.map((point) => normal.dot(point) - origin);
  const thickness = Math.max(...distances) - Math.min(...distances);

  if (thickness >= 1) return mesh;

  const offset = normal.multiplyScalar((1 - thickness) / 2);

  return fromConvexPoints(points.flatMap((point) => [point.clone().add(offset), point.clone().sub(offset)]));
}
