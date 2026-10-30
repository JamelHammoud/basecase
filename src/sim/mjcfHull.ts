import * as THREE from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import type { ScenePart } from '../types/robotics';
import { partMatrix, type V3 } from '../utils/kinematics';
import { toMj } from './mjcf';

function hullVertices(tris: Float32Array, place: THREE.Matrix4, origin: V3): number[] | null {
  const pts: THREE.Vector3[] = [];
  const seen = new Set<string>();
  const v = new THREE.Vector3();
  const box = new THREE.Box3();

  for (let i = 0; i < tris.length; i += 3) box.expandByPoint(v.set(tris[i], tris[i + 1], tris[i + 2]));

  const cell = Math.max(box.getSize(new THREE.Vector3()).length() / 160, 1e-3);

  for (let i = 0; i < tris.length; i += 3) {
    v.set(tris[i], tris[i + 1], tris[i + 2]);

    const k = `${Math.round(v.x / cell)},${Math.round(v.y / cell)},${Math.round(v.z / cell)}`;

    if (seen.has(k)) continue;

    seen.add(k);
    pts.push(v.clone().applyMatrix4(place));
  }

  if (pts.length < 4) return null;

  let hull: ConvexHull;

  try {
    hull = new ConvexHull().setFromPoints(pts);
  } catch {
    return null;
  }

  const out: number[] = [];
  const used = new Set<object>();

  for (const face of hull.faces) {
    let e = face.edge;

    do {
      if (!used.has(e.head())) {
        used.add(e.head());

        const p = e.head().point;
        const m = toMj([p.x - origin[0], p.y - origin[1], p.z - origin[2]]);

        out.push(...m);
      }

      e = e.next;
    } while (e !== face.edge);
  }

  return out.length >= 12 ? out : null;
}

const HULLS = new WeakMap<ScenePart, { key: string; verts: number[] | null }>();

export function cachedHull(p: ScenePart, tris: Float32Array, origin: V3): number[] | null {
  const key = `${tris.length}|${origin.join(',')}`;
  const hit = HULLS.get(p);

  if (hit?.key === key) return hit.verts;

  const verts = hullVertices(tris, partMatrix(p), origin);

  HULLS.set(p, { key, verts });

  return verts;
}
