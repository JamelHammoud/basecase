import * as THREE from 'three';
import { pairKey } from '../../../electron/cad-kernel/pairKey.mjs';
import { emptyBounds, includePoint } from './bounds';
import { mergeCollinear, pointKey as keyOf } from './boundaryMerge';
import type { SketchPlane, Vec3 } from './placement';
import type { Sketch, Vec2 } from './types';

export type FacePick = { point: Vec3 } | { normal: Vec3 };

export interface Face {
  plane: SketchPlane;
  edges: Array<[Vec2, Vec2]>;
}

interface Tri {
  i: number;
  normal: THREE.Vector3;
  offset: number;
  area: number;
}

const SAME_NORMAL = 0.999;
const KEY_STEP = 1e-3;

function trianglesOf(soup: ArrayLike<number>): Tri[] {
  const out: Tri[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  for (let i = 0; i + 8 < soup.length; i += 9) {
    a.fromArray(soup, i);
    b.fromArray(soup, i + 3);
    c.fromArray(soup, i + 6);

    const cross = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const area = cross.length() / 2;

    if (area < 1e-9) continue;

    const normal = cross.normalize();

    out.push({ i, normal, offset: normal.dot(a), area });
  }

  return out;
}

function containing(soup: ArrayLike<number>, tris: Tri[], point: THREE.Vector3): Tri | null {
  const triangle = new THREE.Triangle();
  const closest = new THREE.Vector3();
  let best: { tri: Tri; d: number } | null = null;

  for (const tri of tris) {
    triangle.a.fromArray(soup, tri.i);
    triangle.b.fromArray(soup, tri.i + 3);
    triangle.c.fromArray(soup, tri.i + 6);
    triangle.closestPointToPoint(point, closest);

    const d = closest.distanceTo(point);

    if (!best || d < best.d) best = { tri, d };
  }

  return best?.tri ?? null;
}

function outermost(tris: Tri[], normal: THREE.Vector3): Tri | null {
  const facing = tris.filter((t) => t.normal.dot(normal) > SAME_NORMAL);

  return facing.reduce<Tri | null>((best, t) => (!best || t.offset > best.offset ? t : best), null);
}

function frameFor(normal: THREE.Vector3) {
  const n = normal.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const u = Math.abs(n.dot(up)) > SAME_NORMAL ? new THREE.Vector3(1, 0, 0) : up.clone().cross(n).normalize();
  const v = n.clone().cross(u).normalize();

  return { n, u, v };
}

function boundary(triangles: Vec2[][]): Array<[Vec2, Vec2]> {
  const count = new Map<string, { edge: [Vec2, Vec2]; n: number }>();

  for (const tri of triangles) {
    for (let k = 0; k < 3; k++) {
      const p = tri[k];
      const q = tri[(k + 1) % 3];
      const key = pairKey(keyOf(p), keyOf(q));
      const seen = count.get(key);

      if (seen) seen.n += 1;
      else count.set(key, { edge: [p, q], n: 1 });
    }
  }

  return [...count.values()].filter((e) => e.n === 1).map((e) => e.edge);
}

export function faceOf(soup: ArrayLike<number>, pick: FacePick): Face | null {
  const tris = trianglesOf(soup);
  const seed =
    'point' in pick
      ? containing(soup, tris, new THREE.Vector3(...pick.point))
      : outermost(tris, new THREE.Vector3(...pick.normal));

  if (!seed) return null;

  const flat = tris.filter(
    (t) => t.normal.dot(seed.normal) > SAME_NORMAL && Math.abs(t.offset - seed.offset) < KEY_STEP,
  );
  const { n, u, v } = frameFor(seed.normal);
  const corner = new THREE.Vector3();
  const bounds = emptyBounds();
  const planar = flat.map((t) =>
    [0, 3, 6].map((k): Vec2 => {
      corner.fromArray(soup, t.i + k);

      const x = corner.dot(u);
      const y = corner.dot(v);

      includePoint(bounds, x, y);

      return [x, y];
    }),
  );
  const { min, max } = bounds;
  const mid: Vec2 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
  const origin = n.clone().multiplyScalar(seed.offset).addScaledVector(u, mid[0]).addScaledVector(v, mid[1]);
  const edges = mergeCollinear(boundary(planar)).map(([p, q]): [Vec2, Vec2] => [
    [p[0] - mid[0], p[1] - mid[1]],
    [q[0] - mid[0], q[1] - mid[1]],
  ]);
  const vec = (x: THREE.Vector3): Vec3 => [x.x, x.y, x.z];

  return { plane: { origin: vec(origin), u: vec(u), v: vec(v), n: vec(n) }, edges };
}

export function placedPlane(local: SketchPlane, pose: { position: Vec3; rotation: Vec3 }): SketchPlane {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...(pose.rotation.map((d) => THREE.MathUtils.degToRad(d)) as Vec3), 'XYZ'),
  );
  const dir = (x: Vec3): Vec3 => new THREE.Vector3(...x).applyQuaternion(q).toArray() as Vec3;
  const origin = new THREE.Vector3(...local.origin).applyQuaternion(q).add(new THREE.Vector3(...pose.position));

  return { origin: origin.toArray() as Vec3, u: dir(local.u), v: dir(local.v), n: dir(local.n) };
}

export function toPartLocal(point: Vec3, pose: { position: Vec3; rotation: Vec3 }, direction = false): Vec3 {
  const q = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(...(pose.rotation.map((d) => THREE.MathUtils.degToRad(d)) as Vec3), 'XYZ'))
    .invert();
  const p = new THREE.Vector3(...point);

  if (!direction) p.sub(new THREE.Vector3(...pose.position));

  return p.applyQuaternion(q).toArray() as Vec3;
}

export function referenceSketch(edges: Array<[Vec2, Vec2]>): Sketch {
  const ids = new Map<string, string>();
  const points: Sketch['points'] = [];

  const pointId = (p: Vec2) => {
    const key = keyOf(p);
    const known = ids.get(key);

    if (known) return known;

    const id = `r${points.length + 1}`;

    ids.set(key, id);
    points.push({ id, x: p[0], y: p[1], fixed: true });

    return id;
  };

  const entities = edges.map(([p, q], i) => ({
    id: `e${i + 1}`,
    kind: 'line' as const,
    a: pointId(p),
    b: pointId(q),
    ref: true,
  }));

  return { points, entities, constraints: [] };
}
