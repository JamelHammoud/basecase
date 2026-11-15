import { Matrix4 } from 'three';
import { expect, it } from 'vitest';
import { crossesBox, type RelativeBound, type RouteObstacle } from './routeCollision';

const housing: RouteObstacle = { id: 'housing', min: [-20, -10, -10], max: [3, 10, 10] };
const start = { position: [8, 0, 0] as [number, number, number], obstacleId: 'housing' };
const end = { position: [60, 0, 0] as [number, number, number], obstacleId: 'servo' };
const bound: RelativeBound = (point, obstacleId) => (point.obstacleId === obstacleId ? 0 : 12);

it('keeps clearance at the owner exit while bounding a moving far end', () => {
  expect(crossesBox(start, end, housing, bound)).toBe(false);
  expect(crossesBox(start, { ...end, position: [-60, 0, 0] }, housing, bound)).toBe(true);
});

it('detects an obstruction reached between poses by the displacement envelope', () => {
  const obstruction = {
    id: 'obstruction',
    min: [25, 8, -1] as [number, number, number],
    max: [35, 10, 1] as [number, number, number],
  };

  expect(crossesBox(start, end, obstruction, () => 0)).toBe(false);
  expect(crossesBox(start, end, obstruction, bound)).toBe(true);
});

it('keeps segment collision invariant when a housing rotates with the route', () => {
  const transform = new Matrix4().makeRotationZ(Math.PI / 4);
  const point = (input: typeof start) => ({
    ...input,
    position: [
      input.position[0] * Math.SQRT1_2 - input.position[1] * Math.SQRT1_2,
      input.position[0] * Math.SQRT1_2 + input.position[1] * Math.SQRT1_2,
      input.position[2],
    ] as [number, number, number],
  });
  const moved = { ...housing, transform, inverse: transform.clone().invert() };

  expect(crossesBox(point(start), point(end), moved, bound)).toBe(crossesBox(start, end, housing, bound));
});
