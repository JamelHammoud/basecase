import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Matrix4, Mesh } from 'three';
import type { PortVec } from '../types/ports';
import { routePolyline, routeTopology, type RouteObstacle } from './routeGeometry';

const from = { position: [0, 0, 0] as PortVec, axis: [1, 0, 0] as PortVec };
const to = { position: [100, 0, 0] as PortVec, axis: [-1, 0, 0] as PortVec };
const bracket: RouteObstacle = { id: 'bracket', min: [35, -5, -5], max: [65, 5, 5] };
const length = (points: PortVec[]) =>
  points.slice(1).reduce((sum, point, i) => sum + Math.hypot(...point.map((v, axis) => v - points[i][axis])), 0);

function assertClearance(points: PortVec[], obstacles: RouteObstacle[]) {
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1];
    const end = points[i];
    const samples = Math.ceil(Math.hypot(...end.map((v, axis) => v - start[axis])) * 4);

    for (let step = 0; step <= samples; step++) {
      const point = start.map((v, axis) => v + ((end[axis] - v) * step) / samples);

      for (const obstacle of obstacles) {
        const distance = Math.hypot(
          ...point.map((v, axis) => Math.max(obstacle.min[axis] - v, 0, v - obstacle.max[axis])),
        );

        expect(distance).toBeGreaterThanOrEqual(3 - 1e-8);
      }
    }
  }
}

describe('routePolyline', () => {
  it('keeps outward connector exits even when the shortest route doubles back', () => {
    const route = routePolyline({ from, to: { ...to, axis: [0, 2, 0] }, obstacles: [] });

    expect(route).toEqual([
      [0, 0, 0],
      [8, 0, 0],
      [100, 8, 0],
      [100, 0, 0],
    ]);
  });

  it('routes around a bracket deterministically with at least 3 mm clearance', () => {
    const input = { from, to, obstacles: [bracket] };
    const route = routePolyline(input);

    expect(route).not.toBeNull();
    expect(route![0]).toEqual(from.position);
    expect(route![1]).toEqual([8, 0, 0]);
    expect(route!.at(-2)).toEqual([92, 0, 0]);
    expect(route!.at(-1)).toEqual(to.position);
    expect(length(route!)).toBeGreaterThan(100);
    assertClearance(route!, [bracket]);
    expect(routePolyline(input)).toEqual(route);
  });

  it('keeps the same route when obstacle order changes', () => {
    const upper: RouteObstacle = { id: 'upper', min: [25, 8, -20], max: [75, 20, 20] };
    const route = routePolyline({ from, to, obstacles: [bracket, upper] });

    expect(route).not.toBeNull();
    assertClearance(route!, [bracket, upper]);
    expect(routePolyline({ from, to, obstacles: [upper, bracket] })).toEqual(route);
  });

  it('routes from a clearance boundary produced by rotated mesh bounds', () => {
    const wall = new Mesh(new BoxGeometry(50, 40, 10));

    wall.position.set(40, 0, 0);
    wall.rotation.y = Math.PI / 2;

    const bounds = new Box3().setFromObject(wall);
    const obstacle = { id: 'rotated', min: bounds.min.toArray(), max: bounds.max.toArray() };
    const route = routePolyline({ from: { ...from, position: [24, 0, 0] }, to, obstacles: [obstacle] });

    expect(route).not.toBeNull();
    assertClearance(route!, [obstacle]);
  });

  it('does not miss a thin obstruction on a long segment', () => {
    const thin: RouteObstacle = { id: 'thin', min: [1e6, -5, -5], max: [1e6 + 0.1, 5, 5] };
    const route = routePolyline({ from, to: { ...to, position: [1e12, 0, 0] }, obstacles: [thin] });

    expect(route).not.toBeNull();
    expect(route!.length).toBeGreaterThan(4);
  });

  it('refuses an obstacle across either mandatory connector exit', () => {
    const blocker: RouteObstacle = { id: 'wall', min: [4, -1, -1], max: [5, 1, 1] };
    const farBlocker: RouteObstacle = { id: 'far-wall', min: [95, -1, -1], max: [96, 1, 1] };

    expect(routePolyline({ from, to, obstacles: [blocker] })).toBeNull();
    expect(routePolyline({ from, to, obstacles: [farBlocker] })).toBeNull();
  });

  it('refuses an exit with less than the required clearance', () => {
    const near: RouteObstacle = { id: 'near', min: [4, 2.9, -1], max: [5, 4, 1] };

    expect(routePolyline({ from, to, obstacles: [near] })).toBeNull();
  });

  it('never exempts a neighbouring solid during the owner exit', () => {
    const owner: RouteObstacle = { id: 'owner', min: [-20, -10, -10], max: [1, 10, 10] };
    const neighbour: RouteObstacle = { id: 'neighbour', min: [5, -1, -1], max: [6, 1, 1] };

    expect(routePolyline({ from: { ...from, obstacleId: owner.id }, to, obstacles: [owner, neighbour] })).toBeNull();
  });

  it('labels the same obstacle detour across connector motion and obstacle ordering', () => {
    const route = routePolyline({ from, to, obstacles: [bracket] })!;
    const moved = routePolyline({ from: { ...from, position: [1, 0, 0] }, to, obstacles: [bracket] })!;
    const labels = routeTopology(route, [bracket]);

    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((label) => label.startsWith('bracket:'))).toBe(true);
    expect(routeTopology(moved, [bracket])).toEqual(labels);
    expect(routeTopology(routePolyline({ from, to, obstacles: [] })!, [bracket])).toEqual([]);

    const duplicate = { ...bracket, id: 'duplicate' };
    const otherSide = routePolyline({ from: { ...from, position: [0, 20, 0] }, to, obstacles: [bracket] })!;

    expect(routeTopology(route, [bracket, duplicate])).toEqual(routeTopology(route, [duplicate, bracket]));
    expect(routeTopology(otherSide, [bracket])).not.toEqual(labels);
  });

  it('visits attachment anchors in order and routes around solids between them', () => {
    const anchors: PortVec[] = [
      [25, 20, 0],
      [75, -20, 0],
    ];
    const input = { from, to, obstacles: [bracket], anchors };
    const before = structuredClone(input);
    const route = routePolyline(input);

    expect(route).not.toBeNull();
    expect(route!.findIndex((p) => p.every((v, axis) => v === anchors[0][axis]))).toBeLessThan(
      route!.findIndex((p) => p.every((v, axis) => v === anchors[1][axis])),
    );
    assertClearance(route!, [bracket]);
    expect(input).toEqual(before);
  });

  it('refuses an anchor inside the clearance envelope instead of dropping it', () => {
    expect(routePolyline({ from, to, obstacles: [bracket], anchors: [[40, 0, 0]] })).toBeNull();
    expect(routePolyline({ from, to, obstacles: [bracket], anchors: [[40, 7, 0]] })).toBeNull();
  });

  it('cannot escape a closed enclosure through its empty interior', () => {
    const walls: RouteObstacle[] = [
      { id: 'left', min: [-20, -20, -20], max: [-15, 20, 20] },
      { id: 'right', min: [15, -20, -20], max: [20, 20, 20] },
      { id: 'bottom', min: [-20, -20, -20], max: [20, -15, 20] },
      { id: 'top', min: [-20, 15, -20], max: [20, 20, 20] },
      { id: 'back', min: [-20, -20, -20], max: [20, 20, -15] },
      { id: 'front', min: [-20, -20, 15], max: [20, 20, 20] },
    ];

    expect(routePolyline({ from, to, obstacles: walls })).toBeNull();
  });

  it('refuses non-finite coordinates, inverted boxes and zero connector axes', () => {
    expect(routePolyline({ from: { ...from, axis: [0, 0, 0] }, to, obstacles: [] })).toBeNull();
    expect(routePolyline({ from, to, obstacles: [], anchors: [[NaN, 0, 0]] })).toBeNull();
    expect(routePolyline({ from, to, obstacles: [{ id: 'bad', min: [5, 0, 0], max: [4, 1, 1] }] })).toBeNull();
  });
});

it('checks neighbouring solids along an exit extended beyond eight millimeters', () => {
  const owner: RouteObstacle = { id: 'owner', min: [-20, -10, -10], max: [20, 10, 10] };
  const neighbour: RouteObstacle = { id: 'neighbour', min: [17, -1, -1], max: [18, 1, 1] };
  const endpoint = { ...from, obstacleId: owner.id };

  expect(routePolyline({ from: endpoint, to, obstacles: [owner] })![1]).toEqual([23, 0, 0]);
  expect(routePolyline({ from: endpoint, to, obstacles: [owner, neighbour] })).toBeNull();
});

it('extends the connector exit through a rotated owner in its local frame', () => {
  const transform = new Matrix4().makeRotationZ(Math.PI / 4);
  const owner: RouteObstacle = {
    id: 'owner',
    min: [-20, -10, -10],
    max: [20, 10, 10],
    transform,
    inverse: transform.clone().invert(),
  };
  const route = routePolyline({
    from: { ...from, axis: [Math.SQRT1_2, Math.SQRT1_2, 0], obstacleId: owner.id },
    to,
    obstacles: [owner],
  });

  expect(route).not.toBeNull();
  expect(route![1][0]).toBeCloseTo(23 * Math.SQRT1_2, 10);
  expect(route![1][1]).toBeCloseTo(23 * Math.SQRT1_2, 10);
});

it('keeps direct routing work linear in obstacles, including ordered anchors', () => {
  const counts = [100, 200].map((count) => {
    const obstacles: RouteObstacle[] = Array.from({ length: count }, (_, i) => ({
      id: `box-${i}`,
      min: [i * 30, 100, 100],
      max: [i * 30 + 10, 110, 110],
    }));
    let boundCalls = 0;
    const route = routePolyline({
      from,
      to,
      obstacles,
      anchors: [[50, 0, 0]],
      bound: () => {
        boundCalls++;

        return 0;
      },
    });

    expect(route).toEqual([from.position, [8, 0, 0], [50, 0, 0], [92, 0, 0], to.position]);
    expect(boundCalls).toBeLessThanOrEqual(count * 20);

    return boundCalls;
  });

  expect(counts[1]).toBe(counts[0] * 2);
});

it('allows only the mandatory exit through the connector owner', () => {
  const owner: RouteObstacle = { id: 'owner', min: [-20, -10, -10], max: [1, 10, 10] };
  const endpoint = { ...from, obstacleId: owner.id };
  const behind = { ...to, position: [-100, 0, 0] as PortVec, axis: [1, 0, 0] as PortVec };
  const route = routePolyline({ from: endpoint, to: behind, obstacles: [owner] });

  expect(route).not.toBeNull();
  assertClearance(route!.slice(1), [owner]);
  expect(routePolyline({ from, to: behind, obstacles: [owner] })).toBeNull();

  const extendedOwner = { ...owner, max: [6, 10, 10] as PortVec };
  const extended = routePolyline({ from: endpoint, to, obstacles: [extendedOwner] });

  expect(extended![1]).toEqual([9, 0, 0]);
  assertClearance(extended!.slice(1), [extendedOwner]);
});
