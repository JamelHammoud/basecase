import * as THREE from 'three';
import { pairKey } from '../../../electron/cad-kernel/pairKey.mjs';

const CREASE_DEG = 20;

const pointKey = (x: number, y: number, z: number) =>
  `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;

function gatherFaceNormals(positions: number[], indices: number[], normals: Map<string, THREE.Vector3[]>) {
  const vertexKeys = new Map<number, string>();
  const vertexKey = (i: number) => {
    const hit = vertexKeys.get(i);

    if (hit !== undefined) return hit;

    const key = pointKey(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);

    vertexKeys.set(i, key);

    return key;
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  for (let t = 0; t + 2 < indices.length; t += 3) {
    const corners = [indices[t], indices[t + 1], indices[t + 2]];
    const keys = corners.map(vertexKey);
    const adjacent = keys
      .map((key, k) => normals.get(pairKey(key, keys[(k + 1) % 3])))
      .filter((list) => list !== undefined);

    if (!adjacent.length) continue;

    a.fromArray(positions, corners[0] * 3);
    b.fromArray(positions, corners[1] * 3);
    c.fromArray(positions, corners[2] * 3);

    const normal = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());

    for (const list of adjacent) list.push(normal);
  }
}

export function creaseEdgesOnly(edges: number[], positions: number[], indices: number[]): number[] {
  const keys: string[] = [];

  for (let i = 0; i + 5 < edges.length; i += 6) {
    keys.push(
      pairKey(pointKey(edges[i], edges[i + 1], edges[i + 2]), pointKey(edges[i + 3], edges[i + 4], edges[i + 5])),
    );
  }

  if (!keys.length) return [];

  const normals = new Map<string, THREE.Vector3[]>(keys.map((key) => [key, []]));

  gatherFaceNormals(positions, indices, normals);

  const cosLimit = Math.cos(THREE.MathUtils.degToRad(CREASE_DEG));
  const out: number[] = [];

  for (let i = 0; i + 5 < edges.length; i += 6) {
    const list = normals.get(keys[i / 6]);
    const smooth = list?.length === 2 && list[0].dot(list[1]) > cosLimit;

    if (!smooth) out.push(...edges.slice(i, i + 6));
  }

  return out;
}
