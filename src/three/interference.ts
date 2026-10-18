import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export interface Interference {
  a: string;
  b: string;
  depthMm: number;
  fraction: number;
}

export interface Coplanar {
  a: string;
  b: string;
  areaMm2: number;
}

interface Solid {
  id: string;
  box: THREE.Box3;
  bvh: MeshBVH;
  samples: THREE.Vector3[];
  faces: Array<{ c: THREE.Vector3; n: THREE.Vector3; area: number }>;
}

const RAY_DIRS = [
  new THREE.Vector3(1, 0.13, 0.07),
  new THREE.Vector3(-0.11, 1, 0.17),
  new THREE.Vector3(0.09, -0.15, -1),
].map((v) => v.normalize());

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
  let votes = 0;
  const ray = new THREE.Ray();

  for (const dir of RAY_DIRS) {
    ray.set(p, dir);

    const hits = bvh.raycast(ray, THREE.DoubleSide).filter((h) => h.distance > 1e-4);

    if (hits.length % 2 === 1) votes++;
  }

  return votes >= 2;
}

function buildSolids(objects: PartObject[], maxSamples: number): Solid[] {
  const solids: Solid[] = [];

  for (const { id, object } of objects) {
    const geom = worldGeometry(object);

    if (!geom) continue;

    geom.computeBoundingBox();

    const pos = geom.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / maxSamples));
    const samples: THREE.Vector3[] = [];

    for (let i = 0; i < pos.count; i += step) samples.push(new THREE.Vector3().fromBufferAttribute(pos, i));

    for (let t = 0; t + 2 < pos.count && samples.length < maxSamples * 1.5; t += 3 * step) {
      samples.push(
        new THREE.Vector3()
          .fromBufferAttribute(pos, t)
          .add(new THREE.Vector3().fromBufferAttribute(pos, t + 1))
          .add(new THREE.Vector3().fromBufferAttribute(pos, t + 2))
          .divideScalar(3),
      );
    }

    const faces: Solid['faces'] = [];
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    const tri = new THREE.Triangle();
    const fstep = Math.max(1, Math.floor(pos.count / 3 / 1500));

    for (let t = 0; t + 2 < pos.count; t += 3 * fstep) {
      a.fromBufferAttribute(pos, t);
      b.fromBufferAttribute(pos, t + 1);
      c.fromBufferAttribute(pos, t + 2);
      tri.set(a, b, c);

      const area = tri.getArea();

      if (area < 0.5) continue;

      faces.push({
        c: tri.getMidpoint(new THREE.Vector3()),
        n: tri.getNormal(new THREE.Vector3()),
        area: area * fstep,
      });
    }

    solids.push({ id, box: geom.boundingBox!.clone(), bvh: new MeshBVH(geom), samples, faces });
  }

  return solids;
}

type PartObject = { id: string; object: THREE.Object3D };

function penetration(inner: Solid, outer: Solid, toleranceMm: number) {
  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  let inside = 0,
    depth = 0;
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
}

function coplanarArea(from: Solid, onto: Solid) {
  let area = 0;
  const hit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const pos = onto.bvh.geometry.attributes.position;
  const p0 = new THREE.Vector3(),
    p1 = new THREE.Vector3(),
    p2 = new THREE.Vector3(),
    n = new THREE.Vector3();
  const near = onto.box.clone().expandByScalar(0.1);

  for (const f of from.faces) {
    if (!near.containsPoint(f.c)) continue;

    const h = onto.bvh.closestPointToPoint(f.c, hit as never, 0, 0.05);

    if (!h) continue;

    p0.fromBufferAttribute(pos, h.faceIndex * 3);
    p1.fromBufferAttribute(pos, h.faceIndex * 3 + 1);
    p2.fromBufferAttribute(pos, h.faceIndex * 3 + 2);
    new THREE.Triangle(p0, p1, p2).getNormal(n);

    if (n.dot(f.n) > 0.95) area += f.area;
  }

  return area;
}

function nearFocus(objects: PartObject[], focusSet: Set<string>): PartObject[] {
  const boxOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).expandByScalar(0.5);
  const focused = objects.filter((o) => focusSet.has(o.id)).map((o) => boxOf(o.object));

  return objects.filter((o) => focusSet.has(o.id) || focused.some((b) => b.intersectsBox(boxOf(o.object))));
}

const surfaceArea = (x: Solid) => x.faces.reduce((t, f) => t + f.area, 0);

function sharedFace(A: Solid, B: Solid): Coplanar | null {
  const shared = surfaceArea(A) <= surfaceArea(B) ? coplanarArea(A, B) : coplanarArea(B, A);

  return shared >= 4 ? { a: A.id, b: B.id, areaMm2: Math.round(shared) } : null;
}

function overlap(A: Solid, B: Solid, toleranceMm: number): Interference | null {
  if (!A.box.clone().expandByScalar(-toleranceMm).intersectsBox(B.box)) return null;

  const ab = penetration(A, B, toleranceMm);
  const ba = penetration(B, A, toleranceMm);
  const worst = ab.depth >= ba.depth ? ab : ba;
  const fraction = Math.max(ab.fraction, ba.fraction);

  if (worst.depth <= toleranceMm || fraction <= 0.01) return null;

  return {
    a: A.id,
    b: B.id,
    depthMm: Math.round(worst.depth * 10) / 10,
    fraction: Math.round(fraction * 100) / 100,
  };
}

const skipsFocus = (focusSet: Set<string> | null, A: Solid, B: Solid) =>
  focusSet !== null && !focusSet.has(A.id) && !focusSet.has(B.id);

export function findInterferences(
  objects: PartObject[],
  toleranceMm = 0.3,
  maxSamples = 400,
  focus?: string[],
): { interferences: Interference[]; coplanar: Coplanar[] } {
  const focusSet = focus?.length ? new Set(focus) : null;
  const solids = buildSolids(focusSet ? nearFocus(objects, focusSet) : objects, maxSamples);
  const out: Interference[] = [];
  const coplanar: Coplanar[] = [];

  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const A = solids[i],
        B = solids[j];

      if (skipsFocus(focusSet, A, B) || !A.box.clone().expandByScalar(0.1).intersectsBox(B.box)) continue;

      const face = sharedFace(A, B);
      const hit = overlap(A, B, toleranceMm);

      if (face) coplanar.push(face);

      if (hit) out.push(hit);
    }
  }

  for (const s of solids) s.bvh.geometry.dispose();

  return {
    interferences: out.sort((x, y) => y.depthMm - x.depthMm),
    coplanar: coplanar.sort((x, y) => y.areaMm2 - x.areaMm2),
  };
}
