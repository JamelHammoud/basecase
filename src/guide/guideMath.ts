import type { Box, V3 } from './guideTypes';

const VERTICAL_BIAS = 1.3;

export const boxCenter = (b: Box): V3 => [
  (b.min[0] + b.max[0]) / 2,
  (b.min[1] + b.max[1]) / 2,
  (b.min[2] + b.max[2]) / 2,
];

export const boxSize = (b: Box): V3 => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];

export const boxVolume = (b: Box) => boxSize(b).reduce((v, s) => v * Math.max(s, 0.1), 1);

export const boxDiagonal = (b: Box) => Math.hypot(...boxSize(b));

export function unionBox(boxes: Box[]): Box {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  for (const b of boxes) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }

  return boxes.length ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] };
}

export const boxContains = (b: Box, p: V3) => p.every((v, i) => v >= b.min[i] && v <= b.max[i]);

export const boxesTouch = (a: Box, b: Box, gap: number) =>
  [0, 1, 2].every((i) => a.min[i] - gap <= b.max[i] && b.min[i] - gap <= a.max[i]);

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function snapAxis(v: V3): V3 {
  const weights = [Math.abs(v[0]), Math.abs(v[1]) * VERTICAL_BIAS, Math.abs(v[2])];
  const axis = weights.indexOf(Math.max(...weights));
  const out: V3 = [0, 0, 0];

  if (weights[axis] < 1e-6) return [0, 1, 0];

  out[axis] = Math.sign(v[axis]);

  return out;
}

export const extentAlong = (b: Box, dir: V3) => {
  const s = boxSize(b);

  return Math.abs(dir[0]) * s[0] + Math.abs(dir[1]) * s[1] + Math.abs(dir[2]) * s[2];
};

export function normalize(v: V3): V3 {
  const len = Math.hypot(...v);

  return len < 1e-9 ? [0, 1, 0] : [v[0] / len, v[1] / len, v[2] / len];
}
