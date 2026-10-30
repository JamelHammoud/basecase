import * as THREE from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { MeshBVH } from 'three-mesh-bvh';

const PROBE_DIRECTIONS = [
  [0.5773, 0.5774, 0.5772],
  [-0.4082, 0.8165, 0.4083],
  [0.7071, -0.0001, -0.7071],
].map((d) => new THREE.Vector3(...d).normalize());

export function seeded(seed = 1) {
  let s = seed >>> 0;

  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;

    return s / 4294967296;
  };
}

export function triangleData(mesh) {
  const { positions: p, indices } = mesh;
  const count = indices.length / 3;
  const normals = new Float64Array(count * 3);
  const areas = new Float64Array(count);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let t = 0; t < count; t++) {
    a.fromArray(p, indices[t * 3] * 3);
    b.fromArray(p, indices[t * 3 + 1] * 3).sub(a);
    c.fromArray(p, indices[t * 3 + 2] * 3).sub(a);
    n.crossVectors(b, c);
    areas[t] = n.length() / 2;
    n.normalize().toArray(normals, t * 3);
  }

  return { normals, areas, total: areas.reduce((s, x) => s + x, 0) };
}

export function convexHullOf(mesh) {
  const points = [];

  for (let i = 0; i < mesh.positions.length; i += 3) points.push(new THREE.Vector3().fromArray(mesh.positions, i));

  if (points.length < 4) return null;

  try {
    const hull = new ConvexHull().setFromPoints(points);
    let volume = 0;

    for (const face of hull.faces) {
      const a = face.edge.head().point;
      const b = face.edge.next.head().point;
      const c = face.edge.next.next.head().point;

      volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    }

    const planes = new Float64Array(hull.faces.length * 4);

    hull.faces.forEach((f, i) => planes.set([f.normal.x, f.normal.y, f.normal.z, f.constant], i * 4));

    return { volume: Math.abs(volume), planes };
  } catch {
    return null;
  }
}

export function nearHull(hull, point, within) {
  const { planes } = hull;

  for (let i = 0; i < planes.length; i += 4) {
    if (planes[i] * point.x + planes[i + 1] * point.y + planes[i + 2] * point.z - planes[i + 3] > -within) return true;
  }

  return false;
}

export class MeshQuery {
  constructor(mesh) {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(mesh.positions), 3));
    geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(mesh.indices), 1));
    this.mesh = mesh;
    this.bvh = new MeshBVH(geometry);
    this.ray = new THREE.Ray();
  }

  firstHit(origin, direction, far = Infinity) {
    this.ray.origin.copy(origin);
    this.ray.direction.copy(direction);

    const hit = this.bvh.raycastFirst(this.ray, THREE.DoubleSide, 0, far);

    return hit ? { distance: hit.distance, point: hit.point, normal: hit.face?.normal ?? null } : null;
  }

  crossings(origin, direction) {
    this.ray.origin.copy(origin);
    this.ray.direction.copy(direction);

    const hits = this.bvh.raycast(this.ray, THREE.DoubleSide).map((h) => h.distance);

    hits.sort((x, y) => x - y);

    return hits.filter((d, i) => i === 0 || d - hits[i - 1] > 1e-6).length;
  }

  inside(point) {
    const votes = PROBE_DIRECTIONS.filter((d) => this.crossings(point, d) % 2 === 1).length;

    return votes >= 2;
  }

  closest(point) {
    return this.bvh.closestPointToPoint(point, {}, 0, Infinity);
  }
}

export function sampleSurface(mesh, tris, count, seed = 7) {
  const random = seeded(seed);
  const cumulative = new Float64Array(tris.areas.length);
  let sum = 0;

  tris.areas.forEach((a, i) => (cumulative[i] = sum += a));

  const out = [];

  for (let s = 0; s < count && sum > 0; s++) {
    const target = random() * sum;
    let lo = 0;
    let hi = cumulative.length - 1;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;

      if (cumulative[mid] < target) lo = mid + 1;
      else hi = mid;
    }

    out.push({
      point: pointOn(mesh, lo, [random(), random()]),
      tri: lo,
      normal: new THREE.Vector3().fromArray(tris.normals, lo * 3),
    });
  }

  return out;
}

function pointOn(mesh, t, [u0, v0]) {
  const [u, v] = u0 + v0 > 1 ? [1 - u0, 1 - v0] : [u0, v0];
  const corner = (k) => new THREE.Vector3().fromArray(mesh.positions, mesh.indices[t * 3 + k] * 3);
  const a = corner(0);

  return a.clone().addScaledVector(corner(1).sub(a), u).addScaledVector(corner(2).sub(a), v);
}
