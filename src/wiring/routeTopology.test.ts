import { Matrix4, Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { PortVec } from '../types/ports';
import { routeTopology, type RouteObstacle } from './routeGeometry';

afterEach(() => vi.restoreAllMocks());

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
