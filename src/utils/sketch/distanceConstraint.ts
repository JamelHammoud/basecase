import { constraintResiduals } from './residuals';
import type { Sketch, Vec2 } from './types';

export function selectedDistance(sketch: Sketch, ids: string[]): number {
  const points = new Map(sketch.points.map((p) => [p.id, [p.x, p.y] as Vec2]));
  const entities = new Map(sketch.entities.map((e) => [e.id, e]));

  return constraintResiduals(
    { point: (id) => points.get(id) ?? [0, 0], entity: (id) => entities.get(id), radius: (circle) => circle.r },
    { id: '', kind: 'distance', a: ids[0], b: ids[1], value: 0 },
  )[0];
}

export function pointConstraints(
  sketch: Sketch,
  ids: string[],
  counts: { points: number; lines: number },
): Array<'coincident' | 'distance'> {
  const eligible = counts.points === 2 || (counts.points === 1 && counts.lines === 1);

  return eligible && selectedDistance(sketch, ids) > 1e-6 ? ['coincident', 'distance'] : ['coincident'];
}
