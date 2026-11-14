import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig, type V3 } from '../utils/kinematics';
import { buildCase, builderRobot, caseName, worldsFor, type CaseSpec } from './caseBuilder';
import { scaledToReach } from './scale';
import type { Case } from './schema';
import { runCase } from './testing';
import { glbOf, splatPlyOf } from './worldFixtureFiles';
import { KITCHEN_TABLE, kitchenMesh, splatOn, stairwellMesh, yardMesh } from './worldFixtures';
import { readWorldFiles } from './worldFiles';
import { storedWorld } from './worldOpen';
import { keepPieces } from './worldPieces';
import { fixtureWorld, testDecompose } from './worldTesting';
import type { DroppedFile, MeshWorld, StoredWorld } from './worldTypes';

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const robotOf = (id: string) => {
  const r = fixture(id);

  return builderRobot(buildRig(r.joints, r.parts), r.parts);
};

const marbleFiles = (): DroppedFile[] => [
  { name: 'Kitchen.glb', bytes: glbOf(kitchenMesh()) },
  { name: 'Kitchen.ply', bytes: splatPlyOf(splatOn(kitchenMesh())) },
];

async function opened(files: DroppedFile[]): Promise<StoredWorld> {
  const read = await readWorldFiles(files);

  if (read.kind !== 'world') throw new Error('Not a world');

  const world = await storedWorld(read.world, await testDecompose());

  keepPieces(world.hash, world.pieces);

  return world;
}

let kitchen: Promise<StoredWorld> | null = null;

const marbleKitchen = () => (kitchen ??= opened(marbleFiles()));

async function inWorld(world: MeshWorld, id: string, spec: Omit<CaseSpec, 'world' | 'meshWorld'>): Promise<Case> {
  keepPieces(world.hash, world.pieces);

  const result = buildCase({ ...spec, world: 'mesh', meshWorld: world }, robotOf(id));

  if (!result.ok) throw new Error(result.problem);

  return result.kase;
}

const UNDER_TABLE_MM = 1000;

describe('a dropped world', () => {
  it('offers the ground goals at true size, named after its file', async () => {
    const world = await marbleKitchen();
    const kase = await inWorld(world, 'rover-diff', { goal: 'reach' });

    expect(worldsFor('reach', robotOf('rover-diff'), world).map((w) => w.kind)).toContain('mesh');
    expect(worldsFor('touch', robotOf('arm-6dof'), world).map((w) => w.kind)).not.toContain('mesh');
    expect(caseName('reach', 'mesh', undefined, world)).toBe('Reach a Spot in Kitchen');
    expect(kase.world.mesh).toEqual({ hash: world.hash, name: 'Kitchen', at: expect.any(Array) });
    expect(kase.slot!.reachMm).toBeUndefined();
    expect(scaledToReach(kase, 420, [0, 50, 0])).toBe(kase);
  });

  it('gives the same pieces and the same start for the same files', async () => {
    const first = await marbleKitchen();
    const again = await opened(marbleFiles());
    const start = async (w: MeshWorld) => (await inWorld(w, 'rover-diff', { goal: 'reach' })).world.mesh;

    expect(again.hash).toBe(first.hash);
    expect(again.pieces).toEqual(first.pieces);
    expect(await start(again)).toEqual(await start(first));
  });
});

describe('a dropped world in MuJoCo', () => {
  it('a rover reaches a spot in the Marble kitchen, and a limp one misses', async () => {
    const mj = await loadMujoco();
    const kase = await inWorld(await marbleKitchen(), 'rover-diff', { goal: 'reach', values: { distanceMm: 600 } });

    expect((await runCase(mj, kase, fixture('rover-diff'), { controller: 'reference' })).passed).toBe(true);
    expect((await runCase(mj, kase, fixture('rover-diff'), { controller: 'limp' })).passed).toBe(false);
  });

  it('a rover reaches the spot under the kitchen table', async () => {
    const mj = await loadMujoco();
    const rover = robotOf('rover-diff');
    const kase = await inWorld(await marbleKitchen(), 'rover-diff', {
      goal: 'reach',
      values: { distanceMm: UNDER_TABLE_MM },
    });
    const at = kase.world.mesh!.at;
    const { min, max } = KITCHEN_TABLE;
    const target = kase.reference.timeline.at(-1)!.target!;
    const tableMm = [min[0], min[1], max[0], max[1]].map((v, i) => v * 1000 + at[i % 2 ? 2 : 0]);

    expect(kase.reference.timeline).toHaveLength(1);
    expect(target[0]).toBeGreaterThan(tableMm[0]);
    expect(target[0]).toBeLessThan(tableMm[2]);
    expect(target[2]).toBeGreaterThan(tableMm[1]);
    expect(target[2]).toBeLessThan(tableMm[3]);
    expect(target).toEqual([rover.pivot[0], rover.pivot[1], rover.pivot[2] + UNDER_TABLE_MM] as V3);
    expect((await runCase(mj, kase, fixture('rover-diff'), { controller: 'reference' })).passed).toBe(true);
  });

  it('a rover climbs over a 5° hump in a yard', async () => {
    const mj = await loadMujoco();
    const kase = await inWorld(await fixtureWorld(yardMesh(), 'Yard'), 'rover-diff', {
      goal: 'reach',
      values: { distanceMm: 4500, seconds: 30 },
    });

    expect(kase.reference.timeline).toHaveLength(1);
    expect((await runCase(mj, kase, fixture('rover-diff'), { controller: 'reference' })).passed).toBe(true);
  });

  it('runs and judges a quadruped’s Walk Without Falling in a stairwell', async () => {
    const mj = await loadMujoco();
    const kase = await inWorld(await fixtureWorld(stairwellMesh(), 'Stairwell'), 'quad-servo', { goal: 'walk' });
    const result = await runCase(mj, kase, fixture('quad-servo'), { controller: 'reference' });

    expect(result.refusal).toBeUndefined();
    expect(typeof result.passed).toBe('boolean');
    expect(result.frames.length).toBeGreaterThan(0);
  });
});
