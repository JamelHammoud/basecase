import * as THREE from 'three';
import type { Coplanar, Interference } from '../interference';
import { samplesOf, type ShapeSolid } from './shapeSolid';

export interface Placed {
  id: string;
  solid: ShapeSolid;
  matrix: THREE.Matrix4;
  inverse: THREE.Matrix4;
  box: THREE.Box3;
}

export interface CollideOptions {
  toleranceMm: number;
  maxSamples: number;
  focus?: string[];
  straddle?: string[];
  coplanar?: boolean;
}

function pairFilter(options: CollideOptions) {
  const focus = options.focus?.length ? new Set(options.focus) : null;
  const straddle = options.straddle ? new Set(options.straddle) : null;

  return (A: Placed, B: Placed) =>
    (!focus || focus.has(A.id) || focus.has(B.id)) && (!straddle || straddle.has(A.id) !== straddle.has(B.id));
}

const RAY_DIRS = [
  new THREE.Vector3(1, 0.13, 0.07),
  new THREE.Vector3(-0.11, 1, 0.17),
  new THREE.Vector3(0.09, -0.15, -1),
].map((v) => v.normalize());

export function place(id: string, solid: ShapeSolid, matrix: THREE.Matrix4): Placed {
  return { id, solid, matrix, inverse: matrix.clone().invert(), box: solid.box.clone().applyMatrix4(matrix) };
}

const ray = new THREE.Ray();

function isInside(solid: ShapeSolid, p: THREE.Vector3, dirs: THREE.Vector3[]): boolean {
  let votes = 0;

  for (const dir of dirs) {
    ray.set(p, dir);

    const hits = solid.bvh.raycast(ray, THREE.DoubleSide).filter((h) => h.distance > 1e-4);

    if (hits.length % 2 === 1) votes++;
  }

  return votes >= 2;
}

function penetration(inner: Placed, outer: Placed, { toleranceMm, maxSamples }: CollideOptions) {
  const toOuter = outer.inverse.clone().multiply(inner.matrix);
  const dirs = RAY_DIRS.map((d) => d.clone().transformDirection(outer.inverse));
  const shrunk = outer.solid.box.clone().expandByScalar(-toleranceMm);
  const samples = samplesOf(inner.solid, maxSamples);
  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const p = new THREE.Vector3();
  let inside = 0,
    depth = 0;

  for (let i = 0; i < samples.length; i += 3) {
    p.fromArray(samples, i).applyMatrix4(toOuter);

    if (!shrunk.containsPoint(p) || !isInside(outer.solid, p, dirs)) continue;

    const hit = outer.solid.bvh.closestPointToPoint(p, target as never);
    const d = hit ? hit.distance : 0;

    if (d <= toleranceMm) continue;

    inside++;
    depth = Math.max(depth, d);
  }

  return { fraction: inside / Math.max(1, samples.length / 3), depth };
}

function triangleNormal(positions: Float32Array, face: number, out: THREE.Vector3) {
  const a = new THREE.Vector3().fromArray(positions, face * 9);
  const b = new THREE.Vector3().fromArray(positions, face * 9 + 3);
  const c = new THREE.Vector3().fromArray(positions, face * 9 + 6);

  return new THREE.Triangle(a, b, c).getNormal(out);
}

function coplanarArea(from: Placed, onto: Placed) {
  const toOnto = onto.inverse.clone().multiply(from.matrix);
  const near = onto.solid.box.clone().expandByScalar(0.1);
  const hit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const { centers, normals, areas } = from.solid.faces;
  const c = new THREE.Vector3(),
    n = new THREE.Vector3(),
    m = new THREE.Vector3();
  let area = 0;

  for (let i = 0; i < areas.length; i++) {
    c.fromArray(centers, i * 3).applyMatrix4(toOnto);

    if (!near.containsPoint(c)) continue;

    const h = onto.solid.bvh.closestPointToPoint(c, hit as never, 0, 0.05);

    if (!h) continue;

    n.fromArray(normals, i * 3).transformDirection(toOnto);

    if (triangleNormal(onto.solid.positions, h.faceIndex, m).dot(n) > 0.95) area += areas[i];
  }

  return area;
}

function sharedFace(A: Placed, B: Placed): Coplanar | null {
  const shared = A.solid.surfaceArea <= B.solid.surfaceArea ? coplanarArea(A, B) : coplanarArea(B, A);

  return shared >= 4 ? { a: A.id, b: B.id, areaMm2: Math.round(shared) } : null;
}

function overlap(A: Placed, B: Placed, options: CollideOptions): Interference | null {
  if (!A.box.clone().expandByScalar(-options.toleranceMm).intersectsBox(B.box)) return null;

  const ab = penetration(A, B, options);
  const ba = penetration(B, A, options);
  const worst = ab.depth >= ba.depth ? ab : ba;
  const fraction = Math.max(ab.fraction, ba.fraction);

  if (worst.depth <= options.toleranceMm || fraction <= 0.01) return null;

  return {
    a: A.id,
    b: B.id,
    depthMm: Math.round(worst.depth * 10) / 10,
    fraction: Math.round(fraction * 100) / 100,
  };
}

function nearFocus(placed: Placed[], focusSet: Set<string>) {
  const grown = (p: Placed) => p.box.clone().expandByScalar(0.5);
  const focused = placed.filter((p) => focusSet.has(p.id)).map(grown);

  return placed.filter((p) => focusSet.has(p.id) || focused.some((b) => b.intersectsBox(grown(p))));
}

function candidatePairs(solids: Placed[], options: CollideOptions): Array<[Placed, Placed]> {
  const wanted = pairFilter(options);
  const pairs: Array<[Placed, Placed]> = [];

  for (let i = 0; i < solids.length; i++) {
    const grown = solids[i].box.clone().expandByScalar(0.1);

    for (let j = i + 1; j < solids.length; j++) {
      if (wanted(solids[i], solids[j]) && grown.intersectsBox(solids[j].box)) pairs.push([solids[i], solids[j]]);
    }
  }

  return pairs;
}

export function collide(placed: Placed[], options: CollideOptions) {
  const focusSet = options.focus?.length ? new Set(options.focus) : null;
  const solids = focusSet ? nearFocus(placed, focusSet) : placed;
  const interferences: Interference[] = [];
  const coplanar: Coplanar[] = [];

  for (const [A, B] of candidatePairs(solids, options)) {
    const face = options.coplanar === false ? null : sharedFace(A, B);
    const hit = overlap(A, B, options);

    if (face) coplanar.push(face);

    if (hit) interferences.push(hit);
  }

  return {
    interferences: interferences.sort((x, y) => y.depthMm - x.depthMm),
    coplanar: coplanar.sort((x, y) => y.areaMm2 - x.areaMm2),
  };
}
