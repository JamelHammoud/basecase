import type { V3 } from './solidField';

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: V3) => Math.hypot(a[0], a[1], a[2]);

export function unit(a: V3): V3 {
  const l = length(a);

  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0];
}

export function perpendicular(axis: V3): V3 {
  const helper: V3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];

  return unit(cross(axis, helper));
}

export interface Bounds {
  min: V3;
  max: V3;
}

export function soupBounds(soups: Float32Array[]): Bounds | null {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  for (const soup of soups) {
    for (let i = 0; i < soup.length; i++) {
      const axis = i % 3;

      min[axis] = Math.min(min[axis], soup[i]);
      max[axis] = Math.max(max[axis], soup[i]);
    }
  }

  return min[0] <= max[0] ? { min, max } : null;
}

export const centerOf = ({ min, max }: Bounds): V3 => scale(add(min, max), 0.5);
export const sizeOf = ({ min, max }: Bounds): V3 => sub(max, min);
