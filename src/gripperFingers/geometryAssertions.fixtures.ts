import { Ray, Triangle, Vector3 } from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import type { ScenePart } from '../types/robotics';
import type { V3 } from '../utils/kinematics';
import { partSoup } from '../utils/sketch/fixtures/supportDesigns';
import { fingerCollisionPieces } from './collision';

export function fingerRayHits(part: ScenePart, from: V3, direction: V3): number[] {
  const origin = new Vector3(...from).sub(new Vector3(...part.cad!.originOffset));
  const ray = new Ray(origin, new Vector3(...direction));
  const soup = partSoup(part);
  const triangle = new Triangle();
  const point = new Vector3();
  const hits: number[] = [];

  for (let offset = 0; offset < soup.length; offset += 9) {
    triangle.a.fromArray(soup, offset);
    triangle.b.fromArray(soup, offset + 3);
    triangle.c.fromArray(soup, offset + 6);

    if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, point)) hits.push(point.distanceTo(origin));
  }

  return hits.sort((a, b) => a - b);
}

export function fingerHullContains(part: ScenePart, point: V3): boolean {
  const local = new Vector3(...point).sub(new Vector3(...part.cad!.originOffset));

  return fingerCollisionPieces(part)!.some((vertices) => {
    const points = Array.from({ length: vertices.length / 3 }, (_, index) =>
      new Vector3().fromArray(vertices, index * 3),
    );

    return new ConvexHull().setFromPoints(points).containsPoint(local);
  });
}
