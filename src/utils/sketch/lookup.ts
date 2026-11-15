import type { Sketch, Vec2 } from './types';

export type PointLookup = (id: string) => Vec2;

export function pointLookup(sketch: Sketch): PointLookup {
  let map: Map<string, Vec2> | undefined;

  return (id) => {
    map ??= new Map(sketch.points.map((p) => [p.id, [p.x, p.y] as Vec2]));

    return map.get(id) ?? [0, 0];
  };
}
