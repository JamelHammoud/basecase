import * as THREE from 'three';

export type V3 = [number, number, number];

type P2 = [number, number];

export const G = 9.81;

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);

export const norm = (a: V3): V3 => {
  const l = len(a) || 1;

  return [a[0] / l, a[1] / l, a[2] / l];
};

export function rotateAbout(v: V3, k: V3, deg: number): V3 {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t),
    s = Math.sin(t);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);

  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}

export const lineDistance = (p: V3, o: V3, a: V3) => len(cross(sub(p, o), a));

export function rotateEuler(v: V3, deg: V3): V3 {
  const e = new THREE.Euler(...(deg.map((d) => THREE.MathUtils.degToRad(d)) as V3), 'XYZ');

  return new THREE.Vector3(...v).applyEuler(e).toArray() as V3;
}

export function boxCorners(min: V3, max: V3): V3[] {
  const out: V3[] = [];

  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);

  return out;
}

const crossZ = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function halfHull(pts: P2[]): P2[] {
  const out: P2[] = [];

  for (const p of pts) {
    while (out.length >= 2 && crossZ(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();

    out.push(p);
  }

  return out;
}

export function convexHull(points: P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  if (pts.length < 3) return pts;

  const lower = halfHull(pts);
  const upper = halfHull([...pts].reverse());

  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function polygonMargin(poly: P2[], p: P2): number {
  if (poly.length < 3) return -Infinity;

  let inside = true;
  let best = Infinity;

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0],
      ey = b[1] - a[1];
    const side = ex * (p[1] - a[1]) - ey * (p[0] - a[0]);

    if (side < 0) inside = false;

    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)));

    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * ex), p[1] - (a[1] + t * ey)));
  }

  return inside ? best : -best;
}
