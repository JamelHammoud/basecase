import { box, cylinder } from '../sim/fixtures/parts';
import type { ScenePart } from '../types/robotics';
import { partBounds } from '../utils/selection';

const shapes: Array<[string, 'box' | 'cylinder', [number, number, number], [number, number, number], number]> = [
  ['small-cube', 'box', [20, 20, 20], [0, 0, 0], 0],
  ['tall-carton', 'box', [28, 60, 24], [0, 0, 0], 0],
  ['thin-bar', 'box', [12, 18, 50], [0, 0, 0], 0],
  ['wide-box', 'box', [42, 30, 26], [0, 0, 0], 0],
  ['asymmetric-payload', 'box', [26, 34, 40], [0, 20, 0], 6],
  ['short-cylinder', 'cylinder', [28, 22, 28], [0, 0, 0], 0],
  ['tall-cylinder', 'cylinder', [24, 60, 24], [0, 0, 0], 0],
  ['horizontal-cylinder', 'cylinder', [24, 40, 24], [90, 0, 0], 0],
  ['narrow-cylinder', 'cylinder', [12, 35, 12], [0, 0, 0], 0],
  ['offset-cylinder', 'cylinder', [30, 30, 30], [0, 0, 0], 12],
];

export function selectedPickTargets(): ScenePart[] {
  return shapes.map(([id, kind, size, rotation, offset]) => {
    const part = (kind === 'box' ? box : cylinder)(id, [offset, 0, 178], size, 12);
    const rotated = { ...part, rotation, physics: { dynamic: true, friction: 0.8 } };
    const bounds = partBounds(rotated);

    return { ...rotated, position: [offset, -bounds.min[1], 178] };
  });
}
