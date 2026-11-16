import type { PortVec } from '../types/ports';

export function distance(a: PortVec, b: PortVec): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function pathLength(points: PortVec[]): number {
  let length = 0;

  for (let i = 1; i < points.length; i++) length += distance(points[i], points[i - 1]);

  return length;
}
