import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export const PRINT_RULES = {
  overhangDeg: 45,
  supportDeg: 30,
  minWallMm: 0.84,
};

export type BuildAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
export type Vec3 = [number, number, number];

export interface PrintPose {
  down: Vec3;
  axis?: BuildAxis;
  rotation: [number, number, number, number];
  min: Vec3;
  size: Vec3;
  overhangMm2: number;
  supportMm3: number;
  contactMm2: number;
  requested?: boolean;
}

export interface PrintShape {
  poses: PrintPose[];
  minWallMm: number;
  thinShare: number;
}

const AXES: Record<BuildAxis, Vec3> = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
};

const DOWN = new THREE.Vector3(0, -1, 0);
const MAX_FACES = 6;
const FACE_SHARE = 0.03;
const SAME_DIR = Math.cos(THREE.MathUtils.degToRad(5));

export function poseRotation(down: Vec3): THREE.Quaternion {
  const d = new THREE.Vector3(...down).normalize();

  if (d.dot(DOWN) < -0.999999) return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);

  return new THREE.Quaternion().setFromUnitVectors(d, DOWN);
}

function lowestAlong(tris: Float32Array, up: THREE.Vector3): number {
  let lowest = Infinity;

  for (let i = 0; i < tris.length; i += 3)
    lowest = Math.min(lowest, tris[i] * up.x + tris[i + 1] * up.y + tris[i + 2] * up.z);

  return lowest;
}

function supportUnder(bvh: MeshBVH, centroid: THREE.Vector3, down: THREE.Vector3, h: number) {
  const ray = new THREE.Ray(centroid.clone().addScaledVector(down, 1e-3), down);
  const hit = bvh.raycastFirst(ray, THREE.DoubleSide);

  return hit && hit.distance < h ? hit.distance : h;
}

function orientationCost(tris: Float32Array, bvh: MeshBVH, up: THREE.Vector3) {
  const cos = Math.cos(THREE.MathUtils.degToRad(PRINT_RULES.overhangDeg));
  const supportCos = Math.cos(THREE.MathUtils.degToRad(PRINT_RULES.supportDeg));
  const minH = lowestAlong(tris, up);
  const [a, b, c, n, centroid] = [0, 0, 0, 0, 0].map(() => new THREE.Vector3());
  const ab = new THREE.Vector3();
  const down = up.clone().negate();
  let overhang = 0;
  let support = 0;
  let contact = 0;

  for (let i = 0; i < tris.length; i += 9) {
    a.fromArray(tris, i);
    b.fromArray(tris, i + 3);
    c.fromArray(tris, i + 6);
    n.subVectors(c, b).cross(ab.subVectors(a, b));

    const area2 = n.length();

    if (area2 < 1e-9) continue;

    const facing = n.divideScalar(area2).dot(down);

    if (facing <= cos) continue;

    const area = area2 / 2;
    const h = centroid.copy(a).add(b).add(c).divideScalar(3).dot(up) - minH;

    if (h < 0.3) {
      contact += facing > 0.99 ? area : 0;

      continue;
    }

    overhang += area;

    if (facing > supportCos) support += area * facing * supportUnder(bvh, centroid, down, h);
  }

  return { overhang, support, contact };
}

function poseBox(tris: Float32Array, q: THREE.Quaternion) {
  const v = new THREE.Vector3();
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (let i = 0; i < tris.length; i += 3) {
    v.set(tris[i], tris[i + 1], tris[i + 2]).applyQuaternion(q);
    min.min(v);
    max.max(v);
  }

  return { min, size: max.clone().sub(min) };
}

function poseFor(tris: Float32Array, bvh: MeshBVH, down: Vec3, axis?: BuildAxis): PrintPose {
  const q = poseRotation(down);
  const { min, size } = poseBox(tris, q);
  const { overhang, support, contact } = orientationCost(tris, bvh, new THREE.Vector3(...down).negate().normalize());

  return {
    down,
    axis,
    rotation: [q.x, q.y, q.z, q.w],
    min: min.toArray() as Vec3,
    size: [size.x, size.z, size.y],
    overhangMm2: overhang,
    supportMm3: support,
    contactMm2: contact,
  };
}

interface FaceBucket {
  normal: THREE.Vector3;
  area: number;
  offset: number;
}

function faceBuckets(tris: Float32Array) {
  const buckets = new Map<string, FaceBucket>();
  const [a, b, c, n, ab] = [0, 0, 0, 0, 0].map(() => new THREE.Vector3());
  let total = 0;

  for (let i = 0; i < tris.length; i += 9) {
    a.fromArray(tris, i);
    b.fromArray(tris, i + 3);
    c.fromArray(tris, i + 6);
    n.subVectors(b, a).cross(ab.subVectors(c, a));

    const area2 = n.length();

    if (area2 < 1e-9) continue;

    n.divideScalar(area2);
    total += area2 / 2;

    const key = `${Math.round(n.x * 40)},${Math.round(n.y * 40)},${Math.round(n.z * 40)}`;
    const bucket = buckets.get(key) ?? { normal: new THREE.Vector3(), area: 0, offset: 0 };

    bucket.normal.addScaledVector(n, area2 / 2);
    bucket.offset += a.dot(n) * (area2 / 2);
    bucket.area += area2 / 2;
    buckets.set(key, bucket);
  }

  return { buckets: [...buckets.values()], total };
}

function restsOn(tris: Float32Array, bucket: FaceBucket): boolean {
  const n = bucket.normal.clone().normalize();
  let extreme = -Infinity;

  for (let i = 0; i < tris.length; i += 3)
    extreme = Math.max(extreme, tris[i] * n.x + tris[i + 1] * n.y + tris[i + 2] * n.z);

  return extreme - bucket.offset / bucket.area < 0.3;
}

function faceDowns(tris: Float32Array): Vec3[] {
  const { buckets, total } = faceBuckets(tris);
  const out: THREE.Vector3[] = Object.values(AXES).map((v) => new THREE.Vector3(...v));
  const big = buckets.filter((b) => b.area >= total * FACE_SHARE).sort((x, y) => y.area - x.area);
  const found: Vec3[] = [];

  for (const bucket of big) {
    const n = bucket.normal.clone().normalize();

    if (found.length >= MAX_FACES || out.some((o) => o.dot(n) > SAME_DIR) || !restsOn(tris, bucket)) continue;

    out.push(n);
    found.push(n.toArray().map((x) => Math.round(x * 1e6) / 1e6) as Vec3);
  }

  return found;
}

function wallThickness(tris: Float32Array, bvh: MeshBVH, samples = 1500) {
  const count = tris.length / 9;

  if (!count) return { min: Infinity, thinShare: 0 };

  const areas = new Float32Array(count);
  const [a, b, c, n, ab] = [0, 0, 0, 0, 0].map(() => new THREE.Vector3());
  let total = 0;

  for (let t = 0; t < count; t++) {
    a.fromArray(tris, t * 9);
    b.fromArray(tris, t * 9 + 3);
    c.fromArray(tris, t * 9 + 6);
    areas[t] = n.subVectors(b, a).cross(ab.subVectors(c, a)).length() / 2;
    total += areas[t];
  }

  const step = total / Math.min(samples, count);
  const ray = new THREE.Ray();
  let min = Infinity;
  let thinArea = 0;
  let acc = step / 2;

  for (let t = 0; t < count; t++) {
    acc += areas[t];

    if (acc < step) continue;

    acc %= step;
    a.fromArray(tris, t * 9);
    b.fromArray(tris, t * 9 + 3);
    c.fromArray(tris, t * 9 + 6);
    n.subVectors(b, a).cross(ab.subVectors(c, a));

    if (n.lengthSq() < 1e-12) continue;

    n.normalize();
    ray.origin.copy(a).add(b).add(c).divideScalar(3).addScaledVector(n, -1e-3);
    ray.direction.copy(n).negate();

    const hit = bvh.raycastFirst(ray, THREE.DoubleSide);

    if (!hit?.face || hit.face.normal.dot(ray.direction) <= 0) continue;

    min = Math.min(min, hit.distance);
    thinArea += hit.distance < PRINT_RULES.minWallMm ? step : 0;
  }

  return { min, thinShare: total ? Math.min(1, thinArea / total) : 0 };
}

export function bvhOf(tris: Float32Array): MeshBVH {
  const geom = new THREE.BufferGeometry();

  geom.setAttribute('position', new THREE.BufferAttribute(tris, 3));

  return new MeshBVH(geom);
}

export function checkPrintability(tris: Float32Array, bvh: MeshBVH = bvhOf(tris)): PrintShape | null {
  if (tris.length < 9) return null;

  const axes = (Object.keys(AXES) as BuildAxis[]).map((key) => poseFor(tris, bvh, AXES[key], key));
  const faces = faceDowns(tris).map((down) => poseFor(tris, bvh, down));
  const walls = wallThickness(tris, bvh);

  return { poses: [...axes, ...faces], minWallMm: walls.min, thinShare: walls.thinShare };
}

export function extraPose(tris: Float32Array, bvh: MeshBVH, down: Vec3): PrintPose {
  return { ...poseFor(tris, bvh, down), requested: true };
}

export const sameDirection = (a: Vec3, b: Vec3, cosLimit = Math.cos(THREE.MathUtils.degToRad(1))): boolean => {
  const la = Math.hypot(...a);
  const lb = Math.hypot(...b);

  return (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb || 1) > cosLimit;
};

const SPEED_FACTOR: Record<string, number> = { TPU: 0.35, PETG: 0.8 };

export interface PrintVolumes {
  shellMm3: number;
  infillMm3: number;
  supportMm3: number;
  heightMm: number;
  material: string;
}

export function printHours({ shellMm3, infillMm3, supportMm3, heightMm, material }: PrintVolumes): number {
  const slow = SPEED_FACTOR[material] ?? 1;
  const seconds = (shellMm3 / 7 + infillMm3 / 12 + (supportMm3 * 0.2) / 8) / slow + (heightMm / 0.2) * 1.2;

  return seconds / 3600;
}
