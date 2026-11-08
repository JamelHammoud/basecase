import * as THREE from 'three';
import type { Coplanar, Interference } from '../interference';
import { crossingsOf } from './crossing';
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

  return { inside, fraction: inside / Math.max(1, samples.length / 3), depth };
}

const MIN_SAMPLES_INSIDE = 3;
const CROSSINGS_PROBED = 24;
const PROBE_STEPS_MM = [0.5, 1.5, 4, 12, 32];

function crossingDepth(A: Placed, B: Placed) {
  const aToB = B.inverse.clone().multiply(A.matrix);
  const dirsB = RAY_DIRS.map((d) => d.clone().transformDirection(B.inverse));
  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const inB = new THREE.Vector3();
  const depthAt = (p: THREE.Vector3) => {
    if (!isInside(A.solid, p, RAY_DIRS)) return 0;

    inB.copy(p).applyMatrix4(aToB);

    if (!isInside(B.solid, inB, dirsB)) return 0;

    const fromA = A.solid.bvh.closestPointToPoint(p, target as never)?.distance ?? 0;
    const fromB = B.solid.bvh.closestPointToPoint(inB, target as never)?.distance ?? 0;

    return Math.min(fromA, fromB);
  };
  const p = new THREE.Vector3();
  let deepest = 0;

  for (const { point, into } of crossingsOf(A, B, CROSSINGS_PROBED)) {
    for (const step of PROBE_STEPS_MM) {
      deepest = Math.max(
        deepest,
        depthAt(p.copy(point).addScaledVector(into, step)),
        depthAt(p.copy(point).addScaledVector(into, -step)),
      );
    }
  }

  return deepest;
}

function triangleNormal(solid: ShapeSolid, face: number, out: THREE.Vector3) {
  const { index } = solid.bvh.geometry;
  const corner = (k: number) => {
    const at = face * 3 + k;

    return new THREE.Vector3().fromArray(solid.positions, (index ? index.getX(at) : at) * 3);
  };

  return new THREE.Triangle(corner(0), corner(1), corner(2)).getNormal(out);
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

    if (triangleNormal(onto.solid, h.faceIndex, m).dot(n) > 0.95) area += areas[i];
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
  const fraction = Math.max(ab.fraction, ba.fraction);
  const crossed = crossingDepth(A, B);
  const enoughInside = fraction > 0.01 || Math.max(ab.inside, ba.inside) >= MIN_SAMPLES_INSIDE;

  if (crossed <= options.toleranceMm && !enoughInside) return null;

  const depth = Math.max(crossed, ab.depth, ba.depth);

  if (depth <= options.toleranceMm) return null;

  return {
    a: A.id,
    b: B.id,
    depthMm: Math.round(depth * 10) / 10,
    fraction: Math.round(fraction * 100) / 100,
  };
}

function nearFocus(placed: Placed[], focusSet: Set<string>) {
  const grown = (p: Placed) => p.box.clone().expandByScalar(0.5);
  const focused = placed.filter((p) => focusSet.has(p.id)).map(grown);

  return placed.filter((p) => focusSet.has(p.id) || focused.some((b) => b.intersectsBox(grown(p))));
}

type SkipPair = (a: string, b: string) => boolean;

function candidatePairs(solids: Placed[], options: CollideOptions, skip?: SkipPair): Array<[Placed, Placed]> {
  const filter = pairFilter(options);
  const wanted = (A: Placed, B: Placed) => filter(A, B) && !skip?.(A.id, B.id);
  const pairs: Array<[Placed, Placed]> = [];

  for (let i = 0; i < solids.length; i++) {
    const grown = solids[i].box.clone().expandByScalar(0.1);

    for (let j = i + 1; j < solids.length; j++) {
      if (wanted(solids[i], solids[j]) && grown.intersectsBox(solids[j].box)) pairs.push([solids[i], solids[j]]);
    }
  }

  return pairs;
}

export function collide(placed: Placed[], options: CollideOptions, skip?: SkipPair) {
  const focusSet = options.focus?.length ? new Set(options.focus) : null;
  const solids = focusSet ? nearFocus(placed, focusSet) : placed;
  const interferences: Interference[] = [];
  const coplanar: Coplanar[] = [];

  for (const [A, B] of candidatePairs(solids, options, skip)) {
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
