import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

/**
 * Mesh-level interference between parts: which parts pass through each other, and how deep.
 * Parts may touch; they should never interpenetrate. An inserted part (a servo in a bracket,
 * a screw in a boss) needs its pocket or hole cut, or it shows up here.
 */
export interface Interference {
  a: string;
  b: string;
  /** Deepest sampled point of one part inside the other, mm */
  depthMm: number;
  /** Share of the smaller part's sampled points that sit inside the other part */
  fraction: number;
}

/** Two parts with surfaces on the same plane facing the same way: they flicker (z-fight) */
export interface Coplanar {
  a: string;
  b: string;
  /** Approximate shared area, mm² */
  areaMm2: number;
}

interface Solid {
  id: string;
  box: THREE.Box3;
  bvh: MeshBVH;
  samples: THREE.Vector3[];
  /** Triangle centroids with their normals and areas */
  faces: Array<{ c: THREE.Vector3; n: THREE.Vector3; area: number }>;
}

const RAY_DIRS = [new THREE.Vector3(1, 0.13, 0.07), new THREE.Vector3(-0.11, 1, 0.17), new THREE.Vector3(0.09, -0.15, -1)].map((v) => v.normalize());

/** World-space triangle soup of everything under `object` */
function worldGeometry(object: THREE.Object3D): THREE.BufferGeometry | null {
  const chunks: Float32Array[] = [];
  object.updateWorldMatrix(true, true);
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry?.attributes?.position) return;
    const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()) as THREE.BufferGeometry;
    g.applyMatrix4(mesh.matrixWorld);
    chunks.push(g.attributes.position.array as Float32Array);
    g.dispose();
  });
  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (total < 9) return null;
  const all = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(all, 3));
  return geom;
}

function isInside(bvh: MeshBVH, p: THREE.Vector3): boolean {
  // Majority vote of ray parity in three directions (robust to small gaps in imported meshes)
  let votes = 0;
  const ray = new THREE.Ray();
  for (const dir of RAY_DIRS) {
    ray.set(p, dir);
    const hits = bvh.raycast(ray, THREE.DoubleSide).filter((h) => h.distance > 1e-4);
    if (hits.length % 2 === 1) votes++;
  }
  return votes >= 2;
}

function buildSolids(objects: Array<{ id: string; object: THREE.Object3D }>, maxSamples: number): Solid[] {
  const solids: Solid[] = [];
  for (const { id, object } of objects) {
    const geom = worldGeometry(object);
    if (!geom) continue;
    geom.computeBoundingBox();
    const pos = geom.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / maxSamples));
    const samples: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i += step) samples.push(new THREE.Vector3().fromBufferAttribute(pos, i));
    // Triangle centroids catch thin parts whose vertices all sit on the other part's surface
    for (let t = 0; t + 2 < pos.count && samples.length < maxSamples * 1.5; t += 3 * step) {
      samples.push(
        new THREE.Vector3()
          .fromBufferAttribute(pos, t)
          .add(new THREE.Vector3().fromBufferAttribute(pos, t + 1))
          .add(new THREE.Vector3().fromBufferAttribute(pos, t + 2))
          .divideScalar(3)
      );
    }
    const faces: Solid['faces'] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const tri = new THREE.Triangle();
    const fstep = Math.max(1, Math.floor(pos.count / 3 / 1500));
    for (let t = 0; t + 2 < pos.count; t += 3 * fstep) {
      a.fromBufferAttribute(pos, t);
      b.fromBufferAttribute(pos, t + 1);
      c.fromBufferAttribute(pos, t + 2);
      tri.set(a, b, c);
      const area = tri.getArea();
      if (area < 0.5) continue; // sliver triangles carry no visible surface
      faces.push({ c: tri.getMidpoint(new THREE.Vector3()), n: tri.getNormal(new THREE.Vector3()), area: area * fstep });
    }
    solids.push({ id, box: geom.boundingBox!.clone(), bvh: new MeshBVH(geom), samples, faces });
  }
  return solids;
}

/** focus: only report pairs that involve one of these ids (e.g. the part just placed) */
export function findInterferences(
  objects: Array<{ id: string; object: THREE.Object3D }>,
  toleranceMm = 0.3,
  maxSamples = 400,
  focus?: string[]
): { interferences: Interference[]; coplanar: Coplanar[] } {
  const focusSet = focus?.length ? new Set(focus) : null;
  // With a focus, only parts near the focused ones are worth meshing
  if (focusSet) {
    const boxOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).expandByScalar(0.5);
    const focused = objects.filter((o) => focusSet.has(o.id)).map((o) => boxOf(o.object));
    objects = objects.filter((o) => focusSet.has(o.id) || focused.some((b) => b.intersectsBox(boxOf(o.object))));
  }
  const solids = buildSolids(objects, maxSamples);

  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const penetration = (inner: Solid, outer: Solid) => {
    let inside = 0, depth = 0;
    const shrunk = outer.box.clone().expandByScalar(-toleranceMm);
    for (const p of inner.samples) {
      if (!shrunk.containsPoint(p) || !isInside(outer.bvh, p)) continue;
      const hit = outer.bvh.closestPointToPoint(p, target as never);
      const d = hit ? hit.distance : 0;
      if (d <= toleranceMm) continue;
      inside++;
      depth = Math.max(depth, d);
    }
    return { fraction: inside / Math.max(1, inner.samples.length), depth };
  };

  // Same-facing surfaces within 0.05 mm of each other (z-fighting); facing pairs (contact) are fine
  const coplanarArea = (A: Solid, B: Solid) => {
    let area = 0;
    const hit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
    const pos = B.bvh.geometry.attributes.position;
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), n = new THREE.Vector3();
    const near = B.box.clone().expandByScalar(0.1);
    for (const f of A.faces) {
      if (!near.containsPoint(f.c)) continue;
      const h = B.bvh.closestPointToPoint(f.c, hit as never, 0, 0.05);
      if (!h) continue;
      p0.fromBufferAttribute(pos, h.faceIndex * 3);
      p1.fromBufferAttribute(pos, h.faceIndex * 3 + 1);
      p2.fromBufferAttribute(pos, h.faceIndex * 3 + 2);
      new THREE.Triangle(p0, p1, p2).getNormal(n);
      if (n.dot(f.n) > 0.95) area += f.area;
    }
    return area;
  };

  const out: Interference[] = [];
  const coplanar: Coplanar[] = [];
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const A = solids[i], B = solids[j];
      if (focusSet && !focusSet.has(A.id) && !focusSet.has(B.id)) continue;
      if (!A.box.clone().expandByScalar(0.1).intersectsBox(B.box)) continue;
      // Measured from the part with less surface, whose faces are the finer sample
      const surface = (x: Solid) => x.faces.reduce((t, f) => t + f.area, 0);
      const shared = surface(A) <= surface(B) ? coplanarArea(A, B) : coplanarArea(B, A);
      if (shared >= 4) coplanar.push({ a: A.id, b: B.id, areaMm2: Math.round(shared) });
      if (!A.box.clone().expandByScalar(-toleranceMm).intersectsBox(B.box)) continue;
      const ab = penetration(A, B);
      const ba = penetration(B, A);
      const worst = ab.depth >= ba.depth ? ab : ba;
      if (worst.depth > toleranceMm && Math.max(ab.fraction, ba.fraction) > 0.01) {
        out.push({ a: A.id, b: B.id, depthMm: Math.round(worst.depth * 10) / 10, fraction: Math.round(Math.max(ab.fraction, ba.fraction) * 100) / 100 });
      }
    }
  }
  for (const s of solids) s.bvh.geometry.dispose();
  return { interferences: out.sort((x, y) => y.depthMm - x.depthMm), coplanar: coplanar.sort((x, y) => y.areaMm2 - x.areaMm2) };
}
