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
  const triangle = new THREE.Triangle(a, b, c);

  for (let t = 0; t + 2 < indices.length; t += 3) {
    const ia = indices[t];
    const ib = indices[t + 1];
    const ic = indices[t + 2];
    const ka = vertexKey(ia);
    const kb = vertexKey(ib);
    const kc = vertexKey(ic);
    const ab = normals.get(pairKey(ka, kb));
    const bc = normals.get(pairKey(kb, kc));
    const ca = normals.get(pairKey(kc, ka));

    if (!ab && !bc && !ca) continue;

    a.fromArray(positions, ia * 3);
    b.fromArray(positions, ib * 3);
    c.fromArray(positions, ic * 3);

    const normal = triangle.getNormal(new THREE.Vector3());

    ab?.push(normal);
    bc?.push(normal);
    ca?.push(normal);
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

    if (!smooth) out.push(edges[i], edges[i + 1], edges[i + 2], edges[i + 3], edges[i + 4], edges[i + 5]);
  }

  return out;
}
