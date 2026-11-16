import type { Vec2 } from './types';

export interface Bounds2 {
  min: Vec2;
  max: Vec2;
}

export const emptyBounds = (): Bounds2 => ({ min: [Infinity, Infinity], max: [-Infinity, -Infinity] });

export function includePoint(bounds: Bounds2, x: number, y: number) {
  bounds.min[0] = Math.min(bounds.min[0], x);
  bounds.min[1] = Math.min(bounds.min[1], y);
  bounds.max[0] = Math.max(bounds.max[0], x);
  bounds.max[1] = Math.max(bounds.max[1], y);
}
