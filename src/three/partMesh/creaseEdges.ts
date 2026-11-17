import * as THREE from 'three';
import { pairKey } from '../../../electron/cad-kernel/pairKey.mjs';

const CREASE_DEG = 20;
const COS_LIMIT = Math.cos(THREE.MathUtils.degToRad(CREASE_DEG));

interface EdgeFaces {
  count: number;
  x: number;
  y: number;
  z: number;
  smooth: boolean;
}

function appendNormal(edge: EdgeFaces | undefined, normal: THREE.Vector3) {
  if (!edge) return;

  edge.count++;

  if (edge.count === 1) {
    edge.x = normal.x;
    edge.y = normal.y;
    edge.z = normal.z;

    return;
  }

  if (edge.count === 2) edge.smooth = edge.x * normal.x + edge.y * normal.y + edge.z * normal.z > COS_LIMIT;
}

const pointKey = (x: number, y: number, z: number) =>
  `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;

const needsNormal = (edge: EdgeFaces | undefined) => edge !== undefined && edge.count < 2;

function classifyFaceEdges(positions: number[], indices: number[], facesByEdge: Map<string, EdgeFaces>) {
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
  const normal = new THREE.Vector3();

  for (let t = 0; t + 2 < indices.length; t += 3) {
    const ia = indices[t];
    const ib = indices[t + 1];
    const ic = indices[t + 2];
    const ka = vertexKey(ia);
    const kb = vertexKey(ib);
    const kc = vertexKey(ic);
    const ab = facesByEdge.get(pairKey(ka, kb));
    const bc = facesByEdge.get(pairKey(kb, kc));
    const ca = facesByEdge.get(pairKey(kc, ka));

    if (!ab && !bc && !ca) continue;

    if (needsNormal(ab) || needsNormal(bc) || needsNormal(ca)) {
      a.fromArray(positions, ia * 3);
      b.fromArray(positions, ib * 3);
      c.fromArray(positions, ic * 3);

      triangle.getNormal(normal);
    }

    appendNormal(ab, normal);
    appendNormal(bc, normal);
    appendNormal(ca, normal);
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

  const facesByEdge = new Map<string, EdgeFaces>(
    keys.map((key) => [key, { count: 0, x: 0, y: 0, z: 0, smooth: false }]),
  );

  classifyFaceEdges(positions, indices, facesByEdge);

  const out: number[] = [];

  for (let i = 0; i + 5 < edges.length; i += 6) {
    const faces = facesByEdge.get(keys[i / 6])!;
    const smooth = faces.count === 2 && faces.smooth;

    if (!smooth) out.push(edges[i], edges[i + 1], edges[i + 2], edges[i + 3], edges[i + 4], edges[i + 5]);
  }

  return out;
}
