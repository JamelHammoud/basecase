import type { Sketch, Vec2 } from './types';

export interface Inference {
  at: Vec2;
  pointId?: string;
  horizontal: boolean;
  vertical: boolean;
}

export interface InferInput {
  sketch: Sketch;
  cursor: Vec2;
  from?: Vec2 | null;
  tolerance: number;
  grid: number | null;
}

const snapToGrid = (v: number, grid: number | null) => (grid ? Math.round(v / grid) * grid : v);

function nearestPoint(sketch: Sketch, [x, y]: Vec2, tolerance: number) {
  let best: { id: string; at: Vec2; d: number } | null = null;

  for (const p of sketch.points) {
    const d = Math.hypot(p.x - x, p.y - y);

    if (d <= tolerance && (!best || d < best.d)) best = { id: p.id, at: [p.x, p.y], d };
  }

  return best;
}

export function inferPoint({ sketch, cursor, from, tolerance, grid }: InferInput): Inference {
  const hit = nearestPoint(sketch, cursor, tolerance);

  if (hit) {
    return {
      at: hit.at,
      pointId: hit.id,
      horizontal: !!from && Math.abs(hit.at[1] - from[1]) < 1e-9,
      vertical: !!from && Math.abs(hit.at[0] - from[0]) < 1e-9,
    };
  }

  let at: Vec2 = [snapToGrid(cursor[0], grid), snapToGrid(cursor[1], grid)];
  const horizontal = !!from && Math.abs(cursor[1] - from[1]) <= tolerance && Math.abs(cursor[0] - from[0]) > tolerance;
  const vertical = !!from && Math.abs(cursor[0] - from[0]) <= tolerance && Math.abs(cursor[1] - from[1]) > tolerance;

  if (from && horizontal) at = [at[0], from[1]];

  if (from && vertical) at = [from[0], at[1]];

  return { at, horizontal, vertical };
}

export function alongDirection(from: Vec2, toward: Vec2, length: number, angleDeg?: number): Vec2 {
  const angle =
    angleDeg === undefined ? Math.atan2(toward[1] - from[1], toward[0] - from[0]) : (angleDeg * Math.PI) / 180;

  return [from[0] + length * Math.cos(angle), from[1] + length * Math.sin(angle)];
}
