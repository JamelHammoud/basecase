import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { bvhOf, checkPrintability, extraPoses, PRINT_RULES, type Vec3 } from './printability';

const trianglesOf = (geometry: THREE.BufferGeometry) =>
  (geometry.index ? geometry.toNonIndexed() : geometry).attributes.position.array as Float32Array;

function supportedMesh(segments: number) {
  const roof = trianglesOf(new THREE.BoxGeometry(40, 8, 30, segments, 1, segments).translate(4, 15, -3));
  const floor = trianglesOf(new THREE.BoxGeometry(50, 2, 40).translate(-2, -1, 3));
  const tris = new Float32Array(roof.length + floor.length);

  tris.set(roof);
  tris.set(floor, roof.length);

  return tris;
}

function bedHeight(tris: Float32Array, up: THREE.Vector3) {
  let lowest = Infinity;

  for (let i = 0; i < tris.length; i += 3)
    lowest = Math.min(lowest, tris[i] * up.x + tris[i + 1] * up.y + tris[i + 2] * up.z);

  return lowest;
}

function previousCosts(tris: Float32Array, bvh: ReturnType<typeof bvhOf>, down: Vec3) {
  const up = new THREE.Vector3(...down).negate().normalize();
  const direction = up.clone().negate();
  const cos = Math.cos(THREE.MathUtils.degToRad(PRINT_RULES.overhangDeg));
  const supportCos = Math.cos(THREE.MathUtils.degToRad(PRINT_RULES.supportDeg));
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const minH = bedHeight(tris, up);
  let contact = 0;
  let overhang = 0;
  let support = 0;

  for (let i = 0; i < tris.length; i += 9) {
    a.fromArray(tris, i);
    b.fromArray(tris, i + 3);
    c.fromArray(tris, i + 6);
    n.subVectors(c, b).cross(ab.subVectors(a, b));

    const area2 = n.length();

    if (area2 < 1e-9) continue;

    n.divideScalar(area2);
    centroid.copy(a).add(b).add(c).divideScalar(3);

    const facing = n.dot(direction);
    const area = area2 / 2;
    const h = centroid.dot(up) - minH;

    if (facing <= cos) continue;

    if (h < 0.3) {
      contact += facing > 0.99 ? area : 0;

      continue;
    }

    overhang += area;

    if (facing <= supportCos) continue;

    const ray = new THREE.Ray(centroid.clone().addScaledVector(direction, 1e-3), direction);
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide);

    support += area * facing * (hit && hit.distance < h ? hit.distance : h);
  }

  return { contactMm2: contact, overhangMm2: overhang, supportMm3: support };
}

function watchRays(bvh: ReturnType<typeof bvhOf>) {
  const rays = new Set<THREE.Ray>();
  const snapshots: number[][] = [];
  const cast = bvh.raycastFirst.bind(bvh);
  const spy = vi.spyOn(bvh, 'raycastFirst').mockImplementation((ray, ...args) => {
    rays.add(ray);
    snapshots.push([...ray.origin.toArray(), ...ray.direction.toArray()]);

    return cast(ray, ...args);
  });

  return { rays, snapshots, spy };
}

const DOWNS: Vec3[] = [
  [0, -2, 0],
  [0, 1, 0],
  [1, -3, 0.2],
  [-1, -3, -0.2],
];

describe('print support ray workspace', () => {
  it.each([10, 20])('retains exact costs and rays with %s roof subdivisions', (segments) => {
    const tris = supportedMesh(segments);
    const saved = tris.slice();
    const bvh = bvhOf(tris);
    const watched = watchRays(bvh);
    const poses = extraPoses(tris, bvh, DOWNS);
    const actualRays = [...watched.snapshots];
    const calls = watched.spy.mock.calls.length;

    expect(watched.rays.size).toBe(1);
    expect(calls).toBe(6 * segments * segments + 6);
    watched.snapshots.length = 0;

    const expected = DOWNS.map((down) => previousCosts(tris, bvh, down));
    const byDirection = watched.snapshots;
    const sorted = (rays: number[][]) => rays.map((ray) => JSON.stringify(ray)).sort();

    expect(poses.map(({ contactMm2, overhangMm2, supportMm3 }) => ({ contactMm2, overhangMm2, supportMm3 }))).toEqual(
      expected,
    );
    expect(sorted(actualRays)).toEqual(sorted(byDirection));
    expect(tris).toEqual(saved);
    watched.spy.mockRestore();
  });

  it('keeps automatic support rays separate from the wall workspace and from later batches', () => {
    const tris = supportedMesh(5);
    const bvh = bvhOf(tris);
    const watched = watchRays(bvh);
    const shape = checkPrintability(tris, bvh)!;
    const firstRays = new Set(watched.rays);

    expect(firstRays.size).toBe(2);
    watched.rays.clear();

    const manual = extraPoses(
      tris,
      bvh,
      shape.poses.map((pose) => pose.down),
    );

    expect(watched.rays.size).toBe(1);
    expect([...watched.rays].every((ray) => !firstRays.has(ray))).toBe(true);
    expect(manual).toEqual(shape.poses.map((pose) => ({ ...pose, axis: undefined, requested: true })));
    watched.spy.mockRestore();
  });

  it('reads changed geometry and directions on the next call and casts nothing for an empty batch', () => {
    const tris = supportedMesh(3);
    const bvh = bvhOf(tris);
    const first = extraPoses(tris, bvh, DOWNS);
    const changed = supportedMesh(3);

    for (let i = 1; i < changed.length; i += 3) changed[i] *= 2;

    const nextBvh = bvhOf(changed);
    const next = extraPoses(changed, nextBvh, [DOWNS[2], DOWNS[0]]);

    expect(next[1].supportMm3).toBeGreaterThan(first[0].supportMm3);
    expect(next.map((pose) => pose.supportMm3)).toEqual(
      [DOWNS[2], DOWNS[0]].map((down) => previousCosts(changed, nextBvh, down).supportMm3),
    );

    const watched = watchRays(nextBvh);

    expect(extraPoses(changed, nextBvh, [])).toEqual([]);
    expect(watched.spy).not.toHaveBeenCalled();
    watched.spy.mockRestore();
  });
});
