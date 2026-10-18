import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export const P1S = {
  bed: [256, 256] as const,
  height: 250,
  exclude: [18, 28] as const,
  overhangDeg: 45,
  supportDeg: 30,
  minWallMm: 0.84,
};

export type BuildAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export interface PrintCheck {
  up: BuildAxis;
  size: [number, number, number];
  fits: boolean;
  yaw?: number;
  fitNote?: string;
  overhangMm2: number;
  supportMm3: number;
  contactMm2: number;
  minWallMm: number;
  thinShare: number;
}

const AXES: Record<BuildAxis, THREE.Vector3> = {
  '+x': new THREE.Vector3(1, 0, 0),
  '-x': new THREE.Vector3(-1, 0, 0),
  '+y': new THREE.Vector3(0, 1, 0),
  '-y': new THREE.Vector3(0, -1, 0),
  '+z': new THREE.Vector3(0, 0, 1),
  '-z': new THREE.Vector3(0, 0, -1),
};

export function bedFitYaw(w: number, d: number): number | null {
  const [W, D] = P1S.bed;
  const [ex, ey] = P1S.exclude;
  const square = (a: number, b: number) => a <= W && b <= D && (a <= W - ex || b <= D - ey);

  if (square(w, d)) return 0;

  if (square(d, w)) return 90;

  const keepOut: Array<[number, number]> = [
    [0, 0],
    [ex, 0],
    [0, ey],
    [ex, ey],
  ];

  for (let deg = 5; deg < 90; deg += 5) {
    const t = THREE.MathUtils.degToRad(deg);
    const [c, sn] = [Math.cos(t), Math.sin(t)];

    if (w * c + d * sn > W || w * sn + d * c > D) continue;

    const u: [number, number] = [c, -sn];
    const v: [number, number] = [sn, c];
    const cx = W / 2;
    const cy = D / 2;
    const inside = ([x, y]: [number, number]) =>
      Math.abs((x - cx) * u[0] + (y - cy) * u[1]) <= w / 2 && Math.abs((x - cx) * v[0] + (y - cy) * v[1]) <= d / 2;

    if (keepOut.some(inside)) continue;

    const corners: Array<[number, number]> = [-1, 1].flatMap((i) =>
      [-1, 1].map(
        (j) => [cx + (i * w * u[0] + j * d * v[0]) / 2, cy + (i * w * u[1] + j * d * v[1]) / 2] as [number, number],
      ),
    );

    if (corners.some(([x, y]) => x < ex && y < ey)) continue;

    return deg;
  }

  return null;
}

export const fitsBed = (w: number, d: number): boolean => bedFitYaw(w, d) !== null;

function lowestAlong(tris: Float32Array, up: THREE.Vector3): number {
  let lowest = Infinity;

  for (let i = 0; i < tris.length; i += 3)
    lowest = Math.min(lowest, tris[i] * up.x + tris[i + 1] * up.y + tris[i + 2] * up.z);

  return lowest;
}

function orientationCost(tris: Float32Array, bvh: MeshBVH, up: THREE.Vector3) {
  const cos = Math.cos(THREE.MathUtils.degToRad(P1S.overhangDeg));
  const supportCos = Math.cos(THREE.MathUtils.degToRad(P1S.supportDeg));
  const minH = lowestAlong(tris, up);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const n = new THREE.Vector3(),
    centroid = new THREE.Vector3();
  const down = up.clone().negate();
  const ray = new THREE.Ray();
  let overhang = 0;
  let support = 0;
  let contact = 0;

  for (let i = 0; i < tris.length; i += 9) {
    a.fromArray(tris, i);
    b.fromArray(tris, i + 3);
    c.fromArray(tris, i + 6);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));

    const area2 = n.length();

    if (area2 < 1e-9) continue;

    n.divideScalar(area2);

    const area = area2 / 2;
    const facing = n.dot(down);

    if (facing <= cos) continue;

    centroid.copy(a).add(b).add(c).divideScalar(3);

    const h = centroid.dot(up) - minH;

    if (h < 0.3) {
      contact += facing > 0.99 ? area : 0;

      continue;
    }

    overhang += area;

    if (facing <= supportCos) continue;

    ray.origin.copy(centroid).addScaledVector(down, 1e-3);
    ray.direction.copy(down);

    const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
    const drop = hit && hit.distance < h ? hit.distance : h;

    support += area * facing * drop;
  }

  return { overhang, support, contact };
}

function wallThickness(tris: Float32Array, bvh: MeshBVH, samples = 1500) {
  const count = tris.length / 9;

  if (!count) return { min: Infinity, thinShare: 0 };

  const areas = new Float32Array(count);
  let total = 0;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    n = new THREE.Vector3();

  for (let t = 0; t < count; t++) {
    a.fromArray(tris, t * 9);
    b.fromArray(tris, t * 9 + 3);
    c.fromArray(tris, t * 9 + 6);
    areas[t] = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
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
    n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));

    if (n.lengthSq() < 1e-12) continue;

    n.normalize();
    ray.origin.copy(a).add(b).add(c).divideScalar(3).addScaledVector(n, -1e-3);
    ray.direction.copy(n).negate();

    const hit = bvh.raycastFirst(ray, THREE.DoubleSide);

    if (!hit || !hit.face || hit.face.normal.dot(ray.direction) <= 0) continue;

    const d = hit.distance;

    if (d < min) min = d;

    if (d < P1S.minWallMm) thinArea += step;
  }

  return { min, thinShare: total ? Math.min(1, thinArea / total) : 0 };
}

export function checkPrintability(tris: Float32Array): PrintCheck | null {
  if (tris.length < 9) return null;

  const geom = new THREE.BufferGeometry();

  geom.setAttribute('position', new THREE.BufferAttribute(tris, 3));

  const bvh = new MeshBVH(geom);
  const box = new THREE.Box3().setFromBufferAttribute(geom.attributes.position as THREE.BufferAttribute);
  const ext = box.getSize(new THREE.Vector3());

  let best: (PrintCheck & { score: number }) | null = null;

  for (const key of Object.keys(AXES) as BuildAxis[]) {
    const up = AXES[key];
    const axis = key[1] as 'x' | 'y' | 'z';
    const others = (['x', 'y', 'z'] as const).filter((k) => k !== axis);
    const height = ext[axis];
    const [w, d] = [ext[others[0]], ext[others[1]]];
    const yaw = height <= P1S.height ? bedFitYaw(w, d) : null;
    const fits = yaw !== null;
    const { overhang, support, contact } = orientationCost(tris, bvh, up);
    const score = (fits ? 0 : 1e12) + support - contact * 0.5 + height * 0.01;

    if (!best || score < best.score)
      best = {
        up: key,
        size: [w, d, height],
        fits,
        yaw: yaw ?? undefined,
        overhangMm2: overhang,
        supportMm3: support,
        contactMm2: contact,
        minWallMm: Infinity,
        thinShare: 0,
        score,
      };
  }

  if (!best) return null;

  const walls = wallThickness(tris, bvh);
  const { score: _score, ...check } = best;

  void _score;
  check.minWallMm = walls.min;
  check.thinShare = walls.thinShare;

  if (!check.fits) {
    const s = [...check.size].sort((x, y) => y - x);

    check.fitNote = `${s.map((v) => Math.round(v)).join(' × ')} mm is larger than the P1S plate (256 × 256 × 250 mm). Split it into ${Math.ceil(s[0] / 240)} pieces along its longest side, joined with dowels or screws.`;
  }

  geom.dispose();

  return check;
}

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

interface Plate {
  shelves: Array<{ y: number; h: number; x: number }>;
}

function placeOnPlate(plate: Plate, w: number, d: number, gap: number): boolean {
  const [W, D] = P1S.bed;
  const shelf = plate.shelves.find((sh) => sh.x + w <= W + gap && d <= sh.h);

  if (shelf) {
    shelf.x += w;

    return true;
  }

  const top = plate.shelves.reduce((sum, sh) => sum + sh.h, 0);

  if (top + d > D + gap) {
    return false;
  }

  plate.shelves.push({ y: top, h: d, x: plate.shelves.length === 0 ? P1S.exclude[0] + w : w });

  return true;
}

export function packPlates(
  items: Array<{ id: string; w: number; d: number }>,
  gap = 6,
): { plates: number; plateOf: Record<string, number> } {
  const [W, D] = P1S.bed;
  const sorted = [...items].map((it) => (it.w < it.d ? { ...it, w: it.d, d: it.w } : it)).sort((a, b) => b.d - a.d);
  const plates: Plate[] = [];
  const plateOf: Record<string, number> = {};

  for (const it of sorted) {
    const w = Math.min(it.w, W) + gap;
    const d = Math.min(it.d, D) + gap;
    const existing = plates.findIndex((plate) => placeOnPlate(plate, w, d, gap));

    if (existing >= 0) {
      plateOf[it.id] = existing;

      continue;
    }

    plates.push({ shelves: [{ y: 0, h: d, x: P1S.exclude[0] + w }] });
    plateOf[it.id] = plates.length - 1;
  }

  return { plates: plates.length, plateOf };
}
