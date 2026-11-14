import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig, type V3 } from '../utils/kinematics';
import { builderRobot } from './caseBuilder';
import { pieceObjects, worldStart } from './meshWorld';
import { MAX_HULL_VERTICES, MAX_HULLS, withoutFloor, worldPieces } from './worldCollider';
import { garageMesh, KITCHEN_TABLE, kitchenMesh, stairwellMesh, yardMesh, type FixtureMesh } from './worldFixtures';
import { fixtureWorld, sceneMesh, testDecompose } from './worldTesting';
import type { MeshWorld } from './worldTypes';

const robotOf = (id: string) => {
  const r = fixtureRobots().find((f) => f.id === id)!;

  return builderRobot(buildRig(r.joints, r.parts), r.parts);
};

const contains = (o: { position: V3; size: V3 }, p: V3) =>
  p.every((v, i) => Math.abs(v - o.position[i]) < o.size[i] / 2);

const FIXTURES: Array<[string, () => FixtureMesh]> = [
  ['Kitchen', kitchenMesh],
  ['Yard', yardMesh],
  ['Stairwell', stairwellMesh],
  ['Garage', garageMesh],
];

function tessellated(cells: number): FixtureMesh {
  const m: FixtureMesh = { positions: [], indices: [], colors: [] };
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    const start = m.positions.length / 3;

    for (let i = 0; i <= cells; i++)
      for (let j = 0; j <= cells; j++) {
        const u = i / cells;

        m.positions.push(x0 + (x1 - x0) * u, (j / cells) * 2.5, z0 + (z1 - z0) * u + Math.sin(i * 7.1 + j) * 0.004);
      }

    for (let i = 0; i < cells; i++)
      for (let j = 0; j < cells; j++) {
        const q = start + i * (cells + 1) + j;

        m.indices.push(q, q + cells + 1, q + cells + 2, q, q + cells + 2, q + 1);
      }
  };

  wall(0, 0, 6, 0);
  wall(6, 0, 6, 5);
  wall(6, 5, 0, 5);
  wall(0, 5, 0, 0);

  return m;
}

describe('a world’s collider', () => {
  it('leaves the floor, and the undersides resting on it, to the ground plane', () => {
    const { positions, indices } = withoutFloor(sceneMesh(kitchenMesh()));
    const resting = 2 + 2 + 4 * 2;

    expect(indices.length / 3).toBe(kitchenMesh().indices.length / 3 - resting);
    expect(Math.max(...positions.filter((_, i) => i % 3 === 1))).toBeCloseTo(2.5);
  });

  it('splits the kitchen into at most 64 hidden pieces of up to 96 vertices', async () => {
    const world = await fixtureWorld(kitchenMesh(), 'Kitchen');

    expect(world.pieces.length).toBeGreaterThanOrEqual(2);
    expect(world.pieces.length).toBeLessThanOrEqual(MAX_HULLS);
    expect(Math.max(...world.pieces.map((p) => p.vertices.length / 3))).toBeLessThanOrEqual(MAX_HULL_VERTICES);
  });

  it('keeps the gap under the kitchen table', async () => {
    const world = await fixtureWorld(kitchenMesh(), 'Kitchen');
    const { min, max } = KITCHEN_TABLE;
    const under: V3 = [((min[0] + max[0]) / 2) * 1000, 300, ((min[1] + max[1]) / 2) * 1000];
    const top = pieceObjects(world).filter((o) => contains(o, [under[0], KITCHEN_TABLE.top * 1000 - 20, under[2]]));

    expect(pieceObjects(world).filter((o) => contains(o, under))).toEqual([]);
    expect(top.length).toBeGreaterThan(0);
  });

  it('gives the same pieces for the same mesh', async () => {
    const kitchen = await fixtureWorld(kitchenMesh(), 'Kitchen');

    expect(worldPieces(sceneMesh(kitchenMesh()), await testDecompose())).toEqual(kitchen.pieces);
  });

  it('marks a ramp the rover climbs as ground, and the counter as in the way', async () => {
    const yard = await fixtureWorld(yardMesh(), 'Yard');
    const kitchen = await fixtureWorld(kitchenMesh(), 'Kitchen');
    const counter = pieceObjects(kitchen).filter((o) => contains(o, [1500, 895, 300]));

    const onTheLine = pieceObjects(yard).filter((o) => Math.abs(o.position[0]) < o.size[0] / 2);

    expect(onTheLine.length).toBeGreaterThan(0);
    expect(onTheLine.every((o) => o.ground)).toBe(true);
    expect(counter.length).toBeGreaterThan(0);
    expect(counter.every((o) => !o.ground)).toBe(true);
  });

  it.each(FIXTURES)('never starts a robot inside a piece of the %s', async (name, make) => {
    const world: MeshWorld = await fixtureWorld(make(), name);

    for (const id of ['rover-diff', 'quad-servo']) {
      const robot = robotOf(id);
      const start = worldStart(world, robot);
      const footprint = pieceObjects(world).filter(
        (o) =>
          o.position[1] - o.size[1] / 2 < robot.heightMm &&
          Math.abs(o.position[0] - start[0]) < (o.size[0] + robot.footprint.width) / 2 &&
          Math.abs(o.position[2] - start[2]) < (o.size[2] + robot.footprint.depth) / 2,
      );

      expect(footprint, id).toEqual([]);
    }
  });

  it('decomposes a 200k-triangle room within 10 s', async () => {
    const room = tessellated(158);
    const decompose = await testDecompose();
    const started = performance.now();
    const pieces = worldPieces(sceneMesh(room), decompose);

    expect(room.indices.length / 3).toBeGreaterThanOrEqual(199_000);
    expect(pieces.length).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(10_000);
  }, 20_000);
});
