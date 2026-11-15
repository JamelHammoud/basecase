import { Matrix4 } from 'three';
import { expect, it } from 'vitest';
import { crossesBox, EPSILON, type RelativeBound, type RouteObstacle, type RoutePoint } from './routeCollision';

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

const box: RouteObstacle = { id: 'box', min: [0, 0, 0], max: [10, 10, 10] };
const fixed: RelativeBound = () => 0;

it.each([0, 1, 2])('keeps open boundaries and parallel thresholds on axis %i', (axis) => {
  const point = (value: number): RoutePoint => {
    const position: [number, number, number] = [5, 5, 5];

    position[axis] = value;

    return { position };
  };
  const cases: Array<[number, number, boolean]> = [
    [-5, 15, true],
    [15, -5, true],
    [-5, 0, false],
    [10, 15, false],
    [0, 0, false],
    [EPSILON, EPSILON, false],
    [2 * EPSILON, 2 * EPSILON, true],
    [EPSILON / 2, EPSILON, false],
    [EPSILON, EPSILON / 2, false],
    [EPSILON / 2, 2 * EPSILON, true],
    [2 * EPSILON, EPSILON / 2, true],
  ];

  for (const [from, to, expected] of cases) {
    expect(crossesBox(point(from), point(to), box, fixed)).toBe(expected);
  }
});

it('intersects all axes over the same segment interval', () => {
  const from: RoutePoint = { position: [-10, 5, 5] };
  const miss: RoutePoint = { position: [5, 20, 5] };
  const hit: RoutePoint = { position: [20, 10, 5] };

  expect(crossesBox(from, miss, box, fixed)).toBe(false);
  expect(crossesBox(from, hit, box, fixed)).toBe(true);
  expect(crossesBox(hit, from, box, fixed)).toBe(true);
});

it('handles growing and shrinking envelopes on stationary segments', () => {
  const from: RoutePoint = { position: [-2, 5, 5], obstacleId: 'start' };
  const to: RoutePoint = { ...from, obstacleId: 'end' };
  const envelope: RelativeBound = (point) => (point.obstacleId === 'start' ? 0 : 4);

  expect(crossesBox(from, to, box, fixed)).toBe(false);
  expect(crossesBox(from, to, box, envelope)).toBe(true);
  expect(crossesBox(to, from, box, envelope)).toBe(true);
  expect(crossesBox(from, to, box, () => 2)).toBe(false);
});

it('isolates each query while a bound callback checks another segment', () => {
  const from: RoutePoint = { position: [-5, 5, 5] };
  const to: RoutePoint = { position: [15, 5, 5] };
  const before = structuredClone({ from, to, box });
  const nested: RelativeBound = () => {
    expect(crossesBox({ position: [-5, -5, -5] }, { position: [-1, -1, -1] }, box, fixed)).toBe(false);

    return 0;
  };

  expect(crossesBox(from, to, box, nested)).toBe(true);
  expect({ from, to, box }).toEqual(before);
});
