import * as THREE from 'three';
import type { ExtendedTriangle } from 'three-mesh-bvh';
import type { Placed } from './collide';

export interface Crossing {
  point: THREE.Vector3;
  into: THREE.Vector3;
}

interface CrossingSample {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

const PLANE_EPS = 0.01;
const SEGMENT_EPS = 0.01;
const PARALLEL = 1e-6;

const NORMAL_A = new THREE.Vector3();
const NORMAL_B = new THREE.Vector3();
const LINE = new THREE.Vector3();

class TriangleCut {
  readonly corners: THREE.Vector3[] = [];
  readonly sides = [0, 0, 0];
  readonly projections = [0, 0, 0];
  from = 0;
  to = 0;
  firstEdge = -1;

  set(triangle: ExtendedTriangle, origin: THREE.Vector3, normal: THREE.Vector3): boolean {
    const { corners, sides } = this;

    corners[0] = triangle.a;
    corners[1] = triangle.b;
    corners[2] = triangle.c;

    for (let i = 0; i < 3; i++) {
      const v = corners[i];

      sides[i] = normal.x * (v.x - origin.x) + normal.y * (v.y - origin.y) + normal.z * (v.z - origin.z);
    }

    return Math.min(sides[0], sides[1], sides[2]) < -PLANE_EPS && Math.max(sides[0], sides[1], sides[2]) > PLANE_EPS;
  }

  span(line: THREE.Vector3): void {
    const { corners, sides, projections } = this;

    for (let i = 0; i < 3; i++) projections[i] = corners[i].dot(line);

    this.from = Infinity;
    this.to = -Infinity;
    this.firstEdge = -1;

    let count = 0;

    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const opposite = sides[i] * sides[j] < 0;

      if (!opposite) continue;

      const at = sides[i] / (sides[i] - sides[j]);
      const t = projections[i] + (projections[j] - projections[i]) * at;

      this.from = Math.min(this.from, t);
      this.to = Math.max(this.to, t);

      if (count === 0) this.firstEdge = i;

      count++;
    }

    if (count < 2) this.from = this.to = 0;
  }

  point(target: THREE.Vector3): THREE.Vector3 {
    const i = this.firstEdge;
    const j = (i + 1) % 3;
    const at = this.sides[i] / (this.sides[i] - this.sides[j]);

    return target.copy(this.corners[i]).lerp(this.corners[j], at);
  }
}

function crossingOf(
  a: ExtendedTriangle,
  b: ExtendedTriangle,
  cuts: { a: TriangleCut; b: TriangleCut; point: THREE.Vector3; into: THREE.Vector3 },
): CrossingSample | null {
  a.getNormal(NORMAL_A);
  b.getNormal(NORMAL_B);
  LINE.crossVectors(NORMAL_A, NORMAL_B);

  if (LINE.lengthSq() < PARALLEL) return null;

  if (!cuts.a.set(a, b.a, NORMAL_B) || !cuts.b.set(b, a.a, NORMAL_A)) return null;

  LINE.normalize();
  cuts.a.span(LINE);
  cuts.b.span(LINE);

  const from = Math.max(cuts.a.from, cuts.b.from);
  const to = Math.min(cuts.a.to, cuts.b.to);

  if (to - from <= SEGMENT_EPS) return null;

  const onPlane = cuts.a.point(cuts.point);
  const along = (from + to) / 2 - onPlane.dot(LINE);

  onPlane.addScaledVector(LINE, along);
  cuts.into.copy(NORMAL_A).add(NORMAL_B).negate().normalize();

  return {
    x: onPlane.x,
    y: onPlane.y,
    z: onPlane.z,
    dx: cuts.into.x,
    dy: cuts.into.y,
    dz: cuts.into.z,
  };
}

const MAX_GATHERED = 2048;

export function crossingsOf(A: Placed, B: Placed, keep: number): Crossing[] {
  const found: CrossingSample[] = [];
  const bToA = A.inverse.clone().multiply(B.matrix);
  const cuts = { a: new TriangleCut(), b: new TriangleCut(), point: new THREE.Vector3(), into: new THREE.Vector3() };

  A.solid.bvh.bvhcast(B.solid.bvh, bToA, {
    intersectsTriangles: (t1: ExtendedTriangle, t2: ExtendedTriangle) => {
      const crossing = crossingOf(t1, t2, cuts);

      if (crossing) found.push(crossing);

      return found.length >= MAX_GATHERED;
    },
  });

  const stride = Math.max(1, Math.floor(found.length / keep));
  const available = Math.ceil(found.length / stride);
  const count = keep < 0 ? Math.max(0, available + Math.ceil(keep)) : Math.min(available, Math.floor(keep));
  const selected: Crossing[] = [];

  for (let i = 0; i < count; i++) {
    const { x, y, z, dx, dy, dz } = found[i * stride];

    selected.push({
      point: new THREE.Vector3(x, y, z),
      into: new THREE.Vector3(dx, dy, dz),
    });
  }

  return selected;
}
