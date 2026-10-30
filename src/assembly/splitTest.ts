import * as THREE from 'three';
import type { Placed } from '../three/analysis/collide';
import { insideSolid } from './probe';
import { gridSamples, worldPoints } from './samples';

export interface SplitPlane {
  axis: 'x' | 'y' | 'z';
  blockers: [string[], string[]];
}

const AXIS_VECTORS: Array<['x' | 'y' | 'z', THREE.Vector3]> = [
  ['x', new THREE.Vector3(1, 0, 0)],
  ['y', new THREE.Vector3(0, 1, 0)],
  ['z', new THREE.Vector3(0, 0, 1)],
];
const ray = new THREE.Ray();

function halfBlockers(points: THREE.Vector3[], dir: THREE.Vector3, others: Placed[]): string[] {
  const blocked = new Set<string>();

  for (const o of points) {
    for (const q of others) {
      if (blocked.has(q.id)) continue;

      ray.set(o.clone().addScaledVector(dir, 0.15), dir);

      if (!ray.intersectsBox(q.box)) continue;

      ray.applyMatrix4(q.inverse);

      if (q.solid.bvh.raycastFirst(ray, THREE.DoubleSide) && !insideSolid(q, o.clone().addScaledVector(dir, 0.3)))
        blocked.add(q.id);
    }
  }

  return [...blocked];
}

export function splitPlanes(part: Placed, others: Placed[]): SplitPlane[] {
  const points = worldPoints(gridSamples(part.solid, 14), part.matrix);
  const centre = part.box.getCenter(new THREE.Vector3());

  return AXIS_VECTORS.map(([axis, v]) => {
    const side = (sign: number) => points.filter((p) => p.clone().sub(centre).dot(v) * sign >= 0);
    const plus = halfBlockers(side(1), v, others);
    const minus = halfBlockers(side(-1), v.clone().negate(), others);

    return { axis, blockers: [plus, minus] };
  });
}
