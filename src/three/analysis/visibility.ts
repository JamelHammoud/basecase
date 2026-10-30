import * as THREE from 'three';
import type { ShapeSolid } from './shapeSolid';

const SAMPLES_PER_PART = 4000;
const GRID = 160;
const SAMPLE_KEY = -SAMPLES_PER_PART;
const VIEWS: Array<[axis: number, sign: number]> = [
  [2, 1],
  [2, -1],
  [0, 1],
  [0, -1],
  [1, 1],
];

export interface VisibilityInput {
  id: string;
  solid: ShapeSolid;
  matrix: THREE.Matrix4;
}

function seeded(seed: number) {
  let s = seed >>> 0;

  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;

    return s / 4294967296;
  };
}

function surfaceSamples(solid: ShapeSolid): Float32Array {
  const cached = solid.samples.get(SAMPLE_KEY);

  if (cached) return cached;

  const p = solid.positions;
  const triangles = p.length / 9;
  const cumulative = new Float64Array(triangles);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let sum = 0;

  for (let t = 0; t < triangles; t++) {
    a.fromArray(p, t * 9);
    b.fromArray(p, t * 9 + 3).sub(a);
    c.fromArray(p, t * 9 + 6).sub(a);
    sum += b.cross(c).length() / 2;
    cumulative[t] = sum;
  }

  const random = seeded(1);
  const out = new Float32Array(triangles && sum > 0 ? SAMPLES_PER_PART * 3 : 0);

  for (let s = 0; s < out.length / 3; s++) {
    const t = Math.min(triangles - 1, lowerBound(cumulative, random() * sum));
    let u = random();
    let v = random();

    if (u + v > 1) [u, v] = [1 - u, 1 - v];

    for (let k = 0; k < 3; k++) {
      const o = p[t * 9 + k];

      out[s * 3 + k] = o + (p[t * 9 + 3 + k] - o) * u + (p[t * 9 + 6 + k] - o) * v;
    }
  }

  solid.samples.set(SAMPLE_KEY, out);

  return out;
}

function lowerBound(values: Float64Array, target: number): number {
  let lo = 0;
  let hi = values.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;

    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }

  return lo;
}

function worldSamples(parts: VisibilityInput[]) {
  const chunks = parts.map((part) => {
    const local = surfaceSamples(part.solid);
    const world = new Float32Array(local.length);
    const v = new THREE.Vector3();

    for (let i = 0; i < local.length; i += 3) v.fromArray(local, i).applyMatrix4(part.matrix).toArray(world, i);

    return world;
  });
  const points = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  const owner = new Int32Array(points.length / 3);
  let offset = 0;

  chunks.forEach((chunk, i) => {
    points.set(chunk, offset);
    owner.fill(i, offset / 3, (offset + chunk.length) / 3);
    offset += chunk.length;
  });

  return { points, owner };
}

function splat(points: Float32Array, owner: Int32Array, [axis, sign]: [number, number], counts: Float64Array) {
  const box = new THREE.Box3().setFromArray(points);
  const keep = [0, 1, 2].filter((k) => k !== axis);
  const span = Math.max(...keep.map((k) => box.max.getComponent(k) - box.min.getComponent(k)), 1e-6);
  const depth = new Float64Array(GRID * GRID).fill(-Infinity);
  const winner = new Int32Array(GRID * GRID).fill(-1);

  for (let i = 0; i < owner.length; i++) {
    const [u, v] = keep.map((k) => Math.floor(((points[i * 3 + k] - box.min.getComponent(k)) / span) * (GRID - 1)));
    const cell = u * GRID + v;
    const d = points[i * 3 + axis] * sign;

    if (d <= depth[cell]) continue;

    depth[cell] = d;
    winner[cell] = owner[i];
  }

  for (const w of winner) if (w >= 0) counts[w]++;
}

export function visibleShares(parts: VisibilityInput[]): Record<string, number> {
  if (!parts.length) return {};

  const { points, owner } = worldSamples(parts);
  const counts = new Float64Array(parts.length);

  for (const view of VIEWS) splat(points, owner, view, counts);

  const total = counts.reduce((s, x) => s + x, 0) || 1;

  return Object.fromEntries(parts.map((p, i) => [p.id, counts[i] / total]));
}
