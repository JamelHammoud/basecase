import { fitCylinder, type Cylinder } from './cylinderFit';
import { add, dot, scale, sub, unit, type MeshIndex, type V3 } from './meshIndex';

export type { Cylinder } from './cylinderFit';

export interface FoundAxis {
  origin: V3;
  axis: V3;
  radius: number;
  travel: [number, number];
}

export interface AxisPick {
  part: 'parent' | 'child';
  point: V3;
}

const PICK_SPAN_DEG = 30;
const BORE_SPAN_DEG = 180;
const MIN_REGION = 4;
const PARALLEL_COS = Math.cos(Math.PI / 180);

const facesCache = new WeakMap<MeshIndex, Cylinder[]>();

function regionFrom(index: MeshIndex, seed: number, seen: Uint8Array): number[] {
  const region = [seed];

  seen[seed] = 1;

  for (let i = 0; i < region.length; i++) {
    const t = region[i];

    for (const u of index.neighbours[t]) {
      if (seen[u] || !index.curved[u] || !index.smooth(t, u)) continue;

      seen[u] = 1;
      region.push(u);
    }
  }

  return region;
}

export function roundFaceAt(index: MeshIndex, point: V3): Cylinder | null {
  const seed = index.nearestTriangle(point);

  if (seed < 0 || !index.curved[seed]) return null;

  return fitCylinder(index, regionFrom(index, seed, new Uint8Array(index.triangles)), PICK_SPAN_DEG);
}

export function roundFaces(index: MeshIndex): Cylinder[] {
  const cached = facesCache.get(index);

  if (cached) return cached;

  const seen = new Uint8Array(index.triangles);
  const out: Cylinder[] = [];

  for (let t = 0; t < index.triangles; t++) {
    if (seen[t] || !index.curved[t]) continue;

    const region = regionFrom(index, t, seen);
    const cylinder = region.length >= MIN_REGION ? fitCylinder(index, region, BORE_SPAN_DEG) : null;

    if (cylinder) out.push(cylinder);
  }

  facesCache.set(index, out);

  return out;
}

const extent = (c: Cylinder, axis: V3, from: V3): [number, number] => {
  const mid = dot(sub(c.center, from), axis);
  const half = (c.length / 2) * Math.abs(dot(c.axis, axis));

  return [mid - half, mid + half];
};

function lineOffset(c: Cylinder, from: V3, axis: V3) {
  const d = sub(c.center, from);

  return Math.hypot(...sub(d, scale(axis, dot(d, axis))));
}

interface Pairing {
  score: number;
  origin: V3;
  axis: V3;
  radius: number;
}

function pairing(shaft: Cylinder, bore: Cylinder): Pairing | null {
  const radius = Math.max(shaft.radius, bore.radius);

  if (shaft.convex === bore.convex || Math.abs(dot(shaft.axis, bore.axis)) < PARALLEL_COS) return null;

  const offset = lineOffset(bore, shaft.center, shaft.axis);
  const clearance = Math.abs(shaft.radius - bore.radius);

  if (offset > Math.max(0.5, radius * 0.05) || clearance > Math.max(1, radius * 0.2)) return null;

  const [a0, a1] = extent(shaft, shaft.axis, shaft.center);
  const [b0, b1] = extent(bore, shaft.axis, shaft.center);
  const from = Math.max(a0, b0);
  const to = Math.min(a1, b1);

  if (to <= from) return null;

  return {
    score: offset + clearance - radius * 1e-3,
    origin: add(shaft.center, scale(shaft.axis, (from + to) / 2)),
    axis: shaft.axis,
    radius: shaft.convex ? shaft.radius : bore.radius,
  };
}

export function coaxialPair(a: Cylinder[], b: Cylinder[]): Pairing | null {
  let best: Pairing | null = null;

  for (const x of a) {
    for (const y of b) {
      const found = x.convex ? pairing(x, y) : pairing(y, x);

      if (found && (!best || found.score < best.score)) best = found;
    }
  }

  return best;
}

export function canonicalAxis(axis: V3): V3 {
  const n = unit(axis);
  const major = n.reduce((k, v, i) => (Math.abs(v) > Math.abs(n[k]) ? i : k), 0);

  return n[major] < 0 ? scale(n, -1) : n;
}

function spanAlong(index: MeshIndex, origin: V3, axis: V3): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  const v = index.vertices;

  for (let i = 0; i < v.length; i += 3) {
    const s = (v[i] - origin[0]) * axis[0] + (v[i + 1] - origin[1]) * axis[1] + (v[i + 2] - origin[2]) * axis[2];

    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
  }

  return [lo, hi];
}

const tenth = (v: number) => Math.round(v * 10) / 10;

export function slideTravel(parent: MeshIndex, child: MeshIndex, line: { origin: V3; axis: V3 }): [number, number] {
  const [p0, p1] = spanAlong(parent, line.origin, line.axis);
  const [c0, c1] = spanAlong(child, line.origin, line.axis);
  const lo = Math.min(0, p0 - c0, p1 - c1);
  const hi = Math.max(0, p0 - c0, p1 - c1);

  if (hi - lo >= 1) return [tenth(lo), tenth(hi)];

  const half = tenth(Math.max(p1 - p0, c1 - c0, 1) / 2);

  return [-half, half];
}

export function findJointAxis(parent: MeshIndex, child: MeshIndex, pick?: AxisPick): FoundAxis | null {
  const picked = pick && roundFaceAt(pick.part === 'parent' ? parent : child, pick.point);
  const line = pick
    ? picked && { origin: picked.center, axis: picked.axis, radius: picked.radius }
    : coaxialPair(roundFaces(parent), roundFaces(child));

  if (!line) return null;

  const axis = canonicalAxis(line.axis);

  return { origin: line.origin, axis, radius: line.radius, travel: slideTravel(parent, child, { ...line, axis }) };
}
