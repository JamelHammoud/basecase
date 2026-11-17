import { Matrix4, Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { PortVec } from '../types/ports';
import { corners, distance, EPSILON, expanded } from './routeCollision';
import { routeTopology, type RouteObstacle } from './routeGeometry';

afterEach(() => vi.restoreAllMocks());

function previousTopology(points: PortVec[], obstacles: RouteObstacle[]): string[] {
  const vertices = obstacles.flatMap((box) =>
    corners(expanded(box)).map((position, bits) => ({ position, label: `${box.id}:${bits}` })),
  );

  return points.slice(2, -2).flatMap((point) => {
    const labels = vertices
      .filter((vertex) => distance(point, vertex.position) < EPSILON)
      .map((vertex) => vertex.label);

    return labels.length ? [labels.sort().join('|')] : [];
  });
}

it('retains full-distance matching at axis and diagonal tolerance boundaries', () => {
  const obstacles: RouteObstacle[] = [
    { id: 'origin', min: [3, 3, 3], max: [13, 13, 13] },
    { id: 'duplicate', min: [3, 3, 3], max: [13, 13, 13] },
    {
      id: 'rotated',
      min: [-10, -20, -30],
      max: [10, 20, 30],
      transform: new Matrix4().makeRotationZ(Math.PI / 7),
    },
  ];
  const offsets = [0, EPSILON / 2, EPSILON * 0.75, EPSILON, EPSILON * 2, -EPSILON, NaN, Infinity];
  const interior = obstacles.flatMap((box) =>
    corners(expanded(box)).flatMap((corner) =>
      offsets.flatMap((offset) => [
        [corner[0] + offset, corner[1], corner[2]] as PortVec,
        [corner[0], corner[1] + offset, corner[2]] as PortVec,
        [corner[0], corner[1], corner[2] + offset] as PortVec,
        corner.map((value) => value + offset) as PortVec,
      ]),
    ),
  );
  const points: PortVec[] = [[0, 0, 0], [8, 0, 0], ...interior, [92, 0, 0], [100, 0, 0]];
  const snapshot = structuredClone({ points, obstacles });

  expect(routeTopology(points, obstacles)).toEqual(previousTopology(points, obstacles));
  expect(routeTopology(points, [...obstacles].reverse())).toEqual(previousTopology(points, obstacles));
  expect({ points, obstacles }).toEqual(snapshot);
});

it.each([300, 600])('measures only nearby corners among %i detour obstacles', (count) => {
  const obstacles: RouteObstacle[] = Array.from({ length: count }, (_, i) => ({
    id: `box-${i}`,
    min: [i * 20, 0, 0],
    max: [i * 20 + 10, 10, 10],
  }));
  const points: PortVec[] = [
    [0, 0, 0],
    [8, 0, 0],
    [-3, -3, -3],
    [92, 0, 0],
    [100, 0, 0],
  ];
  const hypot = vi.spyOn(Math, 'hypot');
  const expected = previousTopology(points, obstacles);

  expect(hypot).toHaveBeenCalledTimes(count * 8);
  hypot.mockClear();
  expect(routeTopology(points, obstacles)).toEqual(expected);
  expect(hypot).toHaveBeenCalledTimes(1);
});

it.each([300, 600])('skips corner transforms for direct routes among %i obstacles', (count) => {
  const obstacles: RouteObstacle[] = Array.from({ length: count }, (_, i) => ({
    id: `box-${i}`,
    min: [i * 20, 0, 0],
    max: [i * 20 + 10, 10, 10],
    transform: new Matrix4().makeRotationZ(i / 100),
  }));
  const points: PortVec[] = [
    [0, 0, 0],
    [8, 0, 0],
    [92, 0, 0],
    [100, 0, 0],
  ];
  const transform = vi.spyOn(Vector3.prototype, 'applyMatrix4');

  expect(routeTopology(points, obstacles)).toEqual([]);
  expect(transform.mock.calls).toHaveLength(0);

  for (let length = 0; length < points.length; length++) {
    expect(routeTopology(points.slice(0, length), obstacles)).toEqual([]);
  }

  expect(transform.mock.calls).toHaveLength(0);
});

it('labels the first interior point, preserves duplicate labels and reads later obstacle edits', () => {
  const box: RouteObstacle = { id: 'z', min: [0, 0, 0], max: [10, 10, 10] };
  const duplicate = { ...box, id: 'a' };
  const points: PortVec[] = [
    [0, 0, 0],
    [8, 0, 0],
    [-3, -3, -3],
    [92, 0, 0],
    [100, 0, 0],
  ];
  const snapshot = structuredClone(points);

  expect(routeTopology(points, [box, duplicate])).toEqual(['a:0|z:0']);
  expect(routeTopology(points, [duplicate, box])).toEqual(['a:0|z:0']);
  expect(routeTopology(points, [])).toEqual([]);
  expect(routeTopology(points.slice(0, 4), [box])).toEqual([]);

  box.min = [1, 1, 1];
  expect(routeTopology(points, [box, duplicate])).toEqual(['a:0']);
  box.min = [0, 0, 0];
  expect(routeTopology(points, [box, duplicate])).toEqual(['a:0|z:0']);
  expect(points).toEqual(snapshot);
});
