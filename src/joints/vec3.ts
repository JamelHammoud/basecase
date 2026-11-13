export type Vec3 = [number, number, number];

export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function normalize3(a: Vec3): Vec3 {
  const length = length3(a);

  return length > 0 ? scale3(a, 1 / length) : [0, 0, 0];
}

export function canonicalAxis(a: Vec3): Vec3 {
  const unit = normalize3(a);
  const largest = unit.reduce((best, value) => (Math.abs(value) > Math.abs(best) ? value : best), 0);

  return largest < 0 ? scale3(unit, -1) : unit;
}

export function perpendicularBasis(axis: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize3(cross3(axis, helper));

  return [u, cross3(axis, u)];
}

export const vertexAt = (positions: ArrayLike<number>, index: number): Vec3 => [
  positions[index * 3],
  positions[index * 3 + 1],
  positions[index * 3 + 2],
];

export const lineDistance3 = (point: Vec3, origin: Vec3, axis: Vec3) => length3(cross3(sub3(point, origin), axis));
