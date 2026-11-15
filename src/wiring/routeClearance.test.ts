import { Matrix4, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import type { PortVec } from '../types/ports';
import {
  crossesBox,
  EPSILON,
  routeClearance,
  type RelativeBound,
  type RouteObstacle,
  type RoutePoint,
} from './routeCollision';
import { routePolyline } from './routeGeometry';

it('matches independent clearance queries across an oriented visibility graph and open boundaries', () => {
  const transform = new Matrix4().makeRotationZ(Math.PI / 4).setPosition(5, -3, 2);
  const obstacles: RouteObstacle[] = [
    { id: 'box', min: [0, 0, 0], max: [10, 10, 10] },
    { id: 'box', min: [-10, -10, -10], max: [-2, -2, -2] },
    { id: 'rotated', min: [-5, -5, -5], max: [5, 5, 5], inverse: transform.clone().invert() },
  ];
  const levels = [-5, 0, EPSILON / 2, EPSILON, 2 * EPSILON, 5, 10, 15];
  const points: RoutePoint[] = levels.flatMap((value) =>
    [0, 1, 2].map((axis) => ({
      position: [0, 1, 2].map((index) => (index === axis ? value : 5)) as PortVec,
      obstacleId: axis === 0 ? 'box' : undefined,
    })),
  );
  const before = structuredClone(points);
  const envelope: RelativeBound = (point, id) => (point.obstacleId === id ? 0 : Math.abs(point.position[0]) / 4);
  let calls = 0;
  const clearance = routeClearance((point, id) => {
    calls++;

    return envelope(point, id);
  });

  for (const start of points) {
    for (const end of points) {
      expect(clearance.clear(start, end, obstacles)).toBe(
        obstacles.every((box) => !crossesBox(start, end, box, envelope)),
      );

      for (const box of obstacles) {
        expect(clearance.crosses(start, end, box)).toBe(crossesBox(start, end, box, envelope));
      }
    }
  }

  expect(calls).toBe(points.length * obstacles.length);
  expect(points).toEqual(before);
});

it('prepares only obstacles reached before a segment is blocked', () => {
  const obstacles: RouteObstacle[] = [
    { id: 'wall', min: [0, 0, 0], max: [10, 10, 10] },
    { id: 'far', min: [100, 100, 100], max: [110, 110, 110] },
  ];
  const bound = vi.fn<RelativeBound>(() => 0);
  const clearance = routeClearance(bound);
  const start: RoutePoint = { position: [-5, 5, 5] };
  const end: RoutePoint = { position: [15, 5, 5] };

  expect(clearance.clear(start, end, obstacles)).toBe(false);
  expect(clearance.clear(end, start, obstacles)).toBe(false);
  expect(bound).toHaveBeenCalledTimes(2);
  expect(bound.mock.calls.every((call) => call[1] === 'wall')).toBe(true);
});

it('reuses point transforms across anchored detours and releases them before an edit or undo', () => {
  const obstacles: RouteObstacle[] = Array.from({ length: 4 }, (_, i) => ({
    id: `box-${i}`,
    min: [35 + i * 100, -5, -5],
    max: [65 + i * 100, 5, 5],
    transform: new Matrix4(),
    inverse: new Matrix4(),
  }));
  const input = {
    from: { position: [0, 0, 0] as PortVec, axis: [1, 0, 0] as PortVec },
    to: { position: [400, 0, 0] as PortVec, axis: [-1, 0, 0] as PortVec },
    obstacles,
    anchors: [
      [25, 20, 0],
      [75, -20, 0],
    ] as PortVec[],
  };
  const snapshot = structuredClone(input);
  const transform = vi.spyOn(Vector3.prototype, 'applyMatrix4');
  const route = routePolyline(input);
  const calls = transform.mock.calls.length;

  transform.mockRestore();
  expect(route).toEqual([
    [0, 0, 0],
    [8, 0, 0],
    [25, 20, 0],
    [32, 8, -8],
    [68, -8, -8],
    [75, -20, 0],
    [368, -8, -8],
    [392, 0, 0],
    [400, 0, 0],
  ]);
  expect(calls).toBeLessThanOrEqual(260);
  expect(input).toEqual(snapshot);

  for (const box of obstacles) {
    box.transform!.makeTranslation(0, 100, 0);
    box.inverse!.copy(box.transform!).invert();
  }

  expect(routePolyline(input)).toEqual([[0, 0, 0], [8, 0, 0], ...input.anchors, [392, 0, 0], [400, 0, 0]]);

  for (const box of obstacles) {
    box.transform!.identity();
    box.inverse!.identity();
  }

  expect(routePolyline(input)).toEqual(route);
});
