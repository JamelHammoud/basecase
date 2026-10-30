import * as THREE from 'three';
import type { ScenePart } from '../types/robotics';
import { eulerToMatrix, type V3 } from './agentFrame';

export type Span = [number, number];

const EPS = 1e-6;
const SAME_HIT = 1e-4;

function localRay(part: ScenePart, origin: V3, dir: V3) {
  const inv = eulerToMatrix(part.rotation).transpose();
  const o = new THREE.Vector3(...origin).sub(new THREE.Vector3(...part.position)).applyMatrix4(inv);
  const d = new THREE.Vector3(...dir).applyMatrix4(inv);

  return { o, d };
}

const edge1 = new THREE.Vector3();
const edge2 = new THREE.Vector3();
const p = new THREE.Vector3();
const q = new THREE.Vector3();
const s = new THREE.Vector3();

function triangleHit(
  ray: { o: THREE.Vector3; d: THREE.Vector3 },
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  edge1.subVectors(b, a);
  edge2.subVectors(c, a);
  p.crossVectors(ray.d, edge2);

  const det = edge1.dot(p);

  if (Math.abs(det) < EPS) return null;

  s.subVectors(ray.o, a);

  const u = s.dot(p) / det;

  if (u < 0 || u > 1) return null;

  q.crossVectors(s, edge1);

  const v = ray.d.dot(q) / det;

  if (v < 0 || u + v > 1) return null;

  return edge2.dot(q) / det;
}

function pairUp(hits: number[]): Span[] {
  const sorted = hits.sort((x, y) => x - y).filter((t, i, all) => i === 0 || t - all[i - 1] > SAME_HIT);
  const spans: Span[] = [];

  for (let i = 0; i + 1 < sorted.length; i += 2) spans.push([sorted[i], sorted[i + 1]]);

  return spans;
}

function meshSpans(cad: NonNullable<ScenePart['cad']>, ray: { o: THREE.Vector3; d: THREE.Vector3 }): Span[] {
  const { positions, indices } = cad;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const hits: number[] = [];

  for (let i = 0; i < indices.length; i += 3) {
    a.fromArray(positions, indices[i] * 3);
    b.fromArray(positions, indices[i + 1] * 3);
    c.fromArray(positions, indices[i + 2] * 3);

    const t = triangleHit(ray, a, b, c);

    if (t !== null) hits.push(t);
  }

  return pairUp(hits);
}

function boxSpan(part: ScenePart, ray: { o: THREE.Vector3; d: THREE.Vector3 }): Span[] {
  const half = new THREE.Vector3(part.dimensions.width, part.dimensions.height, part.dimensions.depth).multiplyScalar(
    0.5,
  );
  const box = new THREE.Box3(half.clone().negate(), half);
  const r = new THREE.Ray(ray.o.clone().addScaledVector(ray.d, -1e5), ray.d);
  const enter = r.intersectBox(box, new THREE.Vector3());

  if (!enter) return [];

  const back = new THREE.Ray(ray.o.clone().addScaledVector(ray.d, 1e5), ray.d.clone().negate());
  const exit = back.intersectBox(box, new THREE.Vector3())!;

  return [[enter.sub(ray.o).dot(ray.d), exit.sub(ray.o).dot(ray.d)]];
}

export function partSpans(part: ScenePart, origin: V3, dir: V3): Span[] {
  const ray = localRay(part, origin, dir);

  if (part.kind === 'cad_part' && part.cad) return meshSpans(part.cad, ray);

  return boxSpan(part, ray);
}
