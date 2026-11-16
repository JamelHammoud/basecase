import { Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { joint } from '../sim/fixtures/parts';
import type { PortVec } from '../types/ports';
import { component, sceneOf } from './fixtures';
import { analyzeWiring } from './routeAnalysis';
import * as measure from './routeMeasure';
import type { RouteObstacle } from './routeGeometry';

afterEach(() => vi.restoreAllMocks());

const previousDistance = (a: PortVec, b: PortVec) => new Vector3(...a).distanceTo(new Vector3(...b));
const previousLength = (points: PortVec[]) =>
  points.slice(1).reduce((length, point, i) => length + previousDistance(point, points[i]), 0);

function fixture(seed: number) {
  const parts = [component('adapter', 'robotis-u2d2'), component('servo', 'dynamixel-xl330-m288')];

  parts[1] = { ...parts[1], position: [70 + seed * 17.3, seed * -0.7, seed * 0.3] };

  const elbow = joint({
    id: 'elbow',
    link: ['adapter', 'servo'],
    origin: [70, 0, 0],
    axis: [0, 0, 1],
    effortNm: 1,
    range: [-15, 15],
  });
  const scene = sceneOf(parts, seed % 2 ? [elbow] : []);
  const obstacles: RouteObstacle[] = seed % 3 ? [] : [{ id: 'bracket', min: [35, -20, -25], max: [45, 20, 25] }];

  return { scene, obstacles };
}

it('preserves distance and path arithmetic at rounding, overflow and nonfinite boundaries', () => {
  const points: PortVec[] = [
    [0, -0, 0],
    [1e-150, 1e-150, -1e-150],
    [180 / 1.15, 1e-9, 0],
    [900 / 1.15, -1e-9, 0],
    [1e154, -1e154, 1e154],
    [Infinity, 0, 0],
    [NaN, 0, 0],
  ];

  for (const a of points) {
    for (const b of points) expect(measure.distance(a, b)).toBe(previousDistance(a, b));
  }

  for (let end = 0; end <= points.length; end++) {
    const path = points.slice(0, end);

    expect(measure.pathLength(path)).toBe(previousLength(path));
  }
});

it('preserves complete stock choices and routes without vector distance measurements', () => {
  const cases = Array.from({ length: 24 }, (_, seed) => fixture(seed));
  const inputs = structuredClone(cases);
  const vectorDistances = vi.spyOn(Vector3.prototype, 'distanceTo');
  const distance = vi.spyOn(measure, 'distance').mockImplementation(previousDistance);
  const pathLength = vi.spyOn(measure, 'pathLength').mockImplementation(previousLength);
  const before = cases.map(({ scene, obstacles }) => analyzeWiring(scene, obstacles));

  expect(vectorDistances.mock.calls.length).toBeGreaterThan(0);
  distance.mockRestore();
  pathLength.mockRestore();
  vectorDistances.mockClear();

  const after = cases.map(({ scene, obstacles }) => analyzeWiring(scene, obstacles));
  const routes = after.flatMap((netlist) => netlist.buses.flatMap((bus) => bus.nets.map((net) => net.route!)));

  expect(after).toEqual(before);
  expect(routes.some((route) => route.status === 'pass')).toBe(true);
  expect(routes.some((route) => route.status === 'fail')).toBe(true);
  expect(routes.some((route) => route.points.length > 4)).toBe(true);
  expect(vectorDistances).not.toHaveBeenCalled();
  expect(cases).toEqual(inputs);
});
