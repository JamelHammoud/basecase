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

function rotated(v: V3, k: V3, c: number, s: number): V3 {
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);

  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}

export function rotationAbout(k: V3, deg: number): (v: V3) => V3 {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);

  return (v) => rotated(v, k, c, s);
}

export function rotateAbout(v: V3, k: V3, deg: number): V3 {
  const t = (deg * Math.PI) / 180;

  return rotated(v, k, Math.cos(t), Math.sin(t));
}

export function lineDistance(p: V3, o: V3, a: V3): number {
  const x = p[0] - o[0];
  const y = p[1] - o[1];
  const z = p[2] - o[2];

  return Math.hypot(y * a[2] - z * a[1], z * a[0] - x * a[2], x * a[1] - y * a[0]);
}

export function rotateEuler(v: V3, deg: V3): V3 {
  const e = new THREE.Euler(...(deg.map((d) => THREE.MathUtils.degToRad(d)) as V3), 'XYZ');

  return new THREE.Vector3(...v).applyEuler(e).toArray() as V3;
}

export function boxCorners(min: V3, max: V3): V3[] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;

  return [
    [x0, y0, z0],
    [x0, y0, z1],
    [x0, y1, z0],
    [x0, y1, z1],
    [x1, y0, z0],
    [x1, y0, z1],
    [x1, y1, z0],
    [x1, y1, z1],
  ];
}

export { convexHull } from './convexHull';

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
