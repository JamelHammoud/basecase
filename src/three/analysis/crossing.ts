import * as THREE from 'three';
import type { ExtendedTriangle } from 'three-mesh-bvh';
import type { Placed } from './collide';

export interface Crossing {
  point: THREE.Vector3;
  into: THREE.Vector3;
}

const PLANE_EPS = 0.01;
const SEGMENT_EPS = 0.01;
const PARALLEL = 1e-6;

const NORMAL_A = new THREE.Vector3();
const NORMAL_B = new THREE.Vector3();
const LINE = new THREE.Vector3();

type Corners = [THREE.Vector3, THREE.Vector3, THREE.Vector3];

const cornersOf = (t: ExtendedTriangle): Corners => [t.a, t.b, t.c];

function planeSides(corners: Corners, origin: THREE.Vector3, normal: THREE.Vector3): [number, number, number] {
  return corners.map(
    (v) => normal.x * (v.x - origin.x) + normal.y * (v.y - origin.y) + normal.z * (v.z - origin.z),
  ) as [number, number, number];
}

const straddles = (sides: number[]) => Math.min(...sides) < -PLANE_EPS && Math.max(...sides) > PLANE_EPS;

function spanAlong(corners: Corners, sides: number[], line: THREE.Vector3): [number, number] {
  const ts: number[] = [];

  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const opposite = sides[i] * sides[j] < 0;

    if (!opposite) continue;

    const at = sides[i] / (sides[i] - sides[j]);

    ts.push(corners[i].dot(line) + (corners[j].dot(line) - corners[i].dot(line)) * at);
  }

  return ts.length < 2 ? [0, 0] : [Math.min(...ts), Math.max(...ts)];
}

function crossingOf(a: ExtendedTriangle, b: ExtendedTriangle): Crossing | null {
  const ca = cornersOf(a);
  const cb = cornersOf(b);

  a.getNormal(NORMAL_A);
  b.getNormal(NORMAL_B);
  LINE.crossVectors(NORMAL_A, NORMAL_B);

  if (LINE.lengthSq() < PARALLEL) return null;

  LINE.normalize();

  const sidesA = planeSides(ca, b.a, NORMAL_B);
  const sidesB = planeSides(cb, a.a, NORMAL_A);

  if (!straddles(sidesA) || !straddles(sidesB)) return null;

  const [a0, a1] = spanAlong(ca, sidesA, LINE);
  const [b0, b1] = spanAlong(cb, sidesB, LINE);
  const from = Math.max(a0, b0);
  const to = Math.min(a1, b1);

  if (to - from <= SEGMENT_EPS) return null;

  const onA = sidesA.findIndex((s, i) => s * sidesA[(i + 1) % 3] < 0);
  const next = ca[(onA + 1) % 3];
  const at = sidesA[onA] / (sidesA[onA] - sidesA[(onA + 1) % 3]);
  const onPlane = ca[onA].clone().lerp(next, at);
  const along = (from + to) / 2 - onPlane.dot(LINE);

  return {
    point: onPlane.addScaledVector(LINE, along),
    into: NORMAL_A.clone().add(NORMAL_B).negate().normalize(),
  };
}

const MAX_GATHERED = 2048;

export function crossingsOf(A: Placed, B: Placed, keep: number): Crossing[] {
  const found: Crossing[] = [];
  const bToA = A.inverse.clone().multiply(B.matrix);

  A.solid.bvh.bvhcast(B.solid.bvh, bToA, {
    intersectsTriangles: (t1: ExtendedTriangle, t2: ExtendedTriangle) => {
      const crossing = crossingOf(t1, t2);

      if (crossing) found.push(crossing);

      return found.length >= MAX_GATHERED;
    },
  });

  const stride = Math.max(1, Math.floor(found.length / keep));

  return found.filter((_, i) => i % stride === 0).slice(0, keep);
}
