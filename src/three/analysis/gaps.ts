import * as THREE from 'three';
import type { Placed } from './collide';

export type PairIds = [string, string];

const toA = new THREE.Matrix4();
const grown = new THREE.Box3();
const near = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
const far = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };

function within(A: Placed, B: Placed, mm: number): boolean {
  if (!grown.copy(A.box).expandByScalar(mm).intersectsBox(B.box)) return false;

  const scale = A.matrix.getMaxScaleOnAxis() || 1;
  const localMm = mm / scale;
  const hit = A.solid.bvh.closestPointToGeometry(
    B.solid.bvh.geometry,
    toA.copy(A.inverse).multiply(B.matrix),
    near,
    far,
    localMm,
    localMm,
  );

  return !!hit && hit.distance <= localMm;
}

export function pairsWithin(placed: Placed[], pairs: PairIds[], mm: number): PairIds[] {
  const byId = new Map(placed.map((p) => [p.id, p]));

  return pairs.filter(([a, b]) => {
    const A = byId.get(a);
    const B = byId.get(b);

    return !!A && !!B && within(A, B, mm);
  });
}
