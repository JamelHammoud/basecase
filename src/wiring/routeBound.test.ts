import { MathUtils, Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { joint } from '../sim/fixtures/parts';
import type { PortVec } from '../types/ports';
import type { RobotJoint } from '../types/robotics';
import { component, sceneOf } from './fixtures';
import { analyzeWiring } from './routeAnalysis';
import { relativeMotionBound } from './routeBound';
import * as motionBounds from './routeBound';
import * as routeMeasure from './routeMeasure';
import type { RoutePoint } from './routeCollision';
import type { RouteObstacle } from './routeGeometry';
import { routeMotion, type RouteMotion } from './routeMotion';

afterEach(() => vi.restoreAllMocks());

const distance = (a: PortVec, b: PortVec) => new Vector3(...a).distanceTo(new Vector3(...b));

function previousChainBound(chain: RobotJoint[], point: PortVec, halves?: Map<string, number>, extra = 0) {
  let bound = 0;

  for (const [i, j] of chain.entries()) {
    const half = halves ? (halves.get(j.id) ?? 0) : Math.max(...(j.range ?? [0]).map(Math.abs));
    const translations = chain
      .slice(0, i)
      .reduce(
        (sum, k) =>
          sum +
          (k.type === 'prismatic' ? Math.max(...(k.range ?? [0]).map(Math.abs)) : 2 * distance(k.origin, j.origin)),
        0,
      );
    const radius = distance(point, j.origin) + translations + extra;

    bound += j.type === 'prismatic' ? half : 2 * radius * Math.sin(Math.min(Math.PI, MathUtils.degToRad(half)) / 2);
  }

  return bound;
}

function previousBound(motion: RouteMotion, point: RoutePoint, obstacleId?: string) {
  const chainOf = (partId: string | undefined) => {
    const owner = partId && motion.rig.ownerOf.get(partId);

    return owner ? [...(motion.rig.chain.get(owner) ?? [])].map((id) => motion.rig.byId.get(id)!) : [];
  };
  const pointChain = chainOf(point.obstacleId);
  const obstacleChain = chainOf(obstacleId);
  const shared = new Set(pointChain.filter((j) => obstacleChain.includes(j)));
  const movingPoint = pointChain.filter((j) => !shared.has(j));
  const movingObstacle = obstacleChain.filter((j) => !shared.has(j));
  const extra = previousChainBound(movingPoint, point.position);

  return (
    previousChainBound(movingPoint, point.position, motion.halves) +
    previousChainBound(movingObstacle.reverse(), point.position, motion.halves, extra)
  );
}

const previousQuery = (motion: RouteMotion) => (point: RoutePoint, obstacleId: string | undefined) =>
  previousBound(motion, point, obstacleId);

function fixture(seed: number) {
  const parts = ['root', 'arm', 'tip', 'finger', 'obstacle', 'fixed', 'loose'].map((id) =>
    component(id, 'dynamixel-xl330-m288'),
  );
  const joints = ['arm', 'tip', 'finger', 'obstacle', 'fixed'].map((id, index) => {
    const parent = index > 0 && index < 3 ? parts[index].id : 'root';

    return {
      ...joint({
        id,
        link: [parent, id],
        origin: [seed * 0.37 + index * 13, index * -7.1, seed * -0.23 + index],
        axis: [0, 0, 1],
        effortNm: 1,
        range: [-20 - seed * 2, 35 + index * 3],
        ...(index > 0 && index < 3 ? { parentJoint: parent } : {}),
      }),
      type: (['revolute', 'prismatic', 'fixed'] as const)[(seed + index) % 3],
    };
  });

  return sceneOf(parts, joints);
}

it('matches complete bounds across mixed chains, shared ancestors, direction changes and unowned solids', () => {
  const ids = ['root', 'arm', 'tip', 'finger', 'obstacle', 'fixed', 'loose', 'missing', '', undefined];
  let comparisons = 0;

  for (let seed = 0; seed < 60; seed++) {
    const motion = routeMotion(fixture(seed));
    const before = structuredClone(motion);
    const bound = relativeMotionBound(motion);

    for (const obstacleId of ids) {
      for (const partId of ids) {
        const point: RoutePoint = { position: [seed * 1.3 - 20, -seed * 0.7, 45], obstacleId: partId };
        const expected = previousBound(motion, point, obstacleId);

        expect(bound(point, obstacleId)).toBe(expected);

        point.position = [-point.position[0], 50, -15];
        expect(bound(point, obstacleId)).toBe(previousBound(motion, point, obstacleId));
        comparisons += 2;
      }
    }

    expect(motion).toEqual(before);
  }

  expect(comparisons).toBe(12000);
});

it('prepares fresh chains after range, pivot and ownership edits', () => {
  const scene = fixture(2);
  const point: RoutePoint = { position: [125, 30, -20], obstacleId: 'finger' };
  const original = relativeMotionBound(routeMotion(scene))(point, 'obstacle');

  scene.project.joints = scene.project.joints!.map((j) => ({ ...j, origin: [20, -30, 15], range: [-150, 150] }));
  scene.project.joints[0] = { ...scene.project.joints[0], child: [...scene.project.joints[0].child, 'loose'] };

  const motion = routeMotion(scene);
  const bound = relativeMotionBound(motion);

  expect(bound(point, 'obstacle')).toBe(previousBound(motion, point, 'obstacle'));
  expect(bound(point, 'obstacle')).not.toBe(original);
  expect(bound({ ...point, obstacleId: 'loose' }, 'arm')).toBe(0);
});

it('retains missing ranges, missing sample gaps and nonfinite arithmetic', () => {
  const motion = routeMotion(fixture(0));

  motion.rig.byId.get('arm')!.range = undefined;
  motion.rig.byId.get('tip')!.range = [] as unknown as [number, number];
  motion.halves.delete('obstacle');

  const bound = relativeMotionBound(motion);
  const positions: PortVec[] = [
    [0, -0, 0],
    [Infinity, 10, 0],
    [NaN, 0, 0],
  ];

  for (const position of positions) {
    const point = { position, obstacleId: 'finger' };

    expect(bound(point, 'obstacle')).toBe(previousBound(motion, point, 'obstacle'));
    expect(bound(point, 'finger')).toBe(0);
  }

  expect(relativeMotionBound(routeMotion(sceneOf([], [])))({ position: [0, 0, 0] }, undefined)).toBe(0);
});

it('preserves complete routed netlists across poses, blocked paths and later scene edits', () => {
  const cases = Array.from({ length: 12 }, (_, seed) => {
    const scene = fixture(seed);

    scene.parts[0] = component('root', 'robotis-u2d2');
    scene.parts = scene.parts.map((part, index) => ({ ...part, position: [index * 50, seed * 2, 0] }));
    scene.project.joints = scene.project.joints!.map((j) => ({ ...j, range: [-15, 15] }));

    const obstacles: RouteObstacle[] = seed % 2 ? [{ id: 'bracket', min: [60, -20, -20], max: [70, 30, 20] }] : [];

    return { scene, obstacles };
  });
  const baseline = vi.spyOn(motionBounds, 'relativeMotionBound').mockImplementation(previousQuery);
  const before = cases.map(({ scene, obstacles }) => analyzeWiring(scene, obstacles));

  baseline.mockRestore();

  const after = cases.map(({ scene, obstacles }) => analyzeWiring(scene, obstacles));

  expect(after).toEqual(before);
  expect(after.some((netlist) => netlist.buses[0].nets.some((net) => net.route!.requiredMm !== null))).toBe(true);
  expect(after.some((netlist) => netlist.buses[0].nets.some((net) => net.route!.status === 'unresolved'))).toBe(true);

  cases[0].scene.parts[1] = { ...cases[0].scene.parts[1], position: [900, 0, 0] };

  const changed = analyzeWiring(cases[0].scene, cases[0].obstacles);

  vi.spyOn(motionBounds, 'relativeMotionBound').mockImplementation(previousQuery);
  expect(changed).toEqual(analyzeWiring(cases[0].scene, cases[0].obstacles));
  expect(changed).not.toEqual(before[0]);
});

it.each([300, 600])('prepares trigonometry and pivot offsets once across %i changing points', (count) => {
  const motion = routeMotion(fixture(0));
  const points: RoutePoint[] = Array.from({ length: count }, (_, i) => ({
    position: [i * 0.3, -i * 0.7, 40],
    obstacleId: 'finger',
  }));
  const sin = vi.spyOn(Math, 'sin');
  const distances = vi.spyOn(Vector3.prototype, 'distanceTo');
  const scalarDistances = vi.spyOn(routeMeasure, 'distance');
  const expected = points.map((point) => previousBound(motion, point, 'obstacle'));
  const previousSines = sin.mock.calls.length;
  const previousDistances = distances.mock.calls.length;

  sin.mockClear();
  distances.mockClear();

  const bound = relativeMotionBound(motion);

  expect(bound(points[0], 'finger')).toBe(0);
  expect(sin).not.toHaveBeenCalled();
  expect(distances).not.toHaveBeenCalled();

  const actual = points.map((point) => bound(point, 'obstacle'));

  expect(actual).toEqual(expected);
  expect(previousSines).toBe(count * 5);
  expect(sin).toHaveBeenCalledTimes(8);
  expect(previousDistances).toBe(count * 11);
  expect(distances).not.toHaveBeenCalled();
  expect(scalarDistances).toHaveBeenCalledTimes(count * 4 + 2);
});
