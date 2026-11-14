import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { evaluateContract } from '../skills/contract';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot, type CaseSpec } from './caseBuilder';
import { routeClearance } from './caseGoals';
import { openWorldSpot } from './importedWorld';
import { fixtureRoom } from './roomFixture';
import { readRoomPlan } from './roomPlan';
import { runCase } from './testing';
import { hashWorldAsset, registerWorldAsset, type WorldAsset } from './worldAssets';
import { decomposeWorld } from './worldDecomposition';
import { kitchenCollider, kitchenSplat, stairwellCollider, yardCollider } from './worldImportFixture';
import { readWorldFiles } from './worldImport';
import type { WorldImportFile } from './worldImportTypes';

const robot = (id = 'rover-diff') => fixtureRobots().find((r) => r.id === id)!;
const builder = (id = 'rover-diff') => {
  const fixture = robot(id);

  return builderRobot(buildRig(fixture.joints, fixture.parts), fixture.parts);
};

async function imported(files: WorldImportFile[]) {
  const world = await readWorldFiles(files);

  if (world.kind !== 'mesh') throw new Error('The fixture must import as a mesh world.');

  const asset: WorldAsset = { world, pieces: await decomposeWorld(world.mesh) };
  const hash = await hashWorldAsset(asset);

  registerWorldAsset(hash, asset);

  return { hash, asset };
}

function built(imported: NonNullable<CaseSpec['imported']>, values: CaseSpec['values'], id = 'rover-diff') {
  const made = buildCase(
    { goal: id === 'rover-diff' ? 'reach' : 'walk', world: 'imported', imported, values },
    builder(id),
  );

  if (!made.ok) throw new Error(made.problem);

  return made.kase;
}

let kitchen: Awaited<ReturnType<typeof imported>>;

beforeAll(async () => {
  kitchen = await imported([kitchenCollider(), kitchenSplat()]);
});

describe('captured worlds in MuJoCo', () => {
  it('a rover reaches a kitchen spot, while the same rover left limp misses', async () => {
    const mj = await loadMujoco();
    const kase = built(kitchen, { distanceMm: 1800, sideMm: 1200, radiusMm: 200, seconds: 18 });
    const reference = await runCase(mj, kase, robot(), { controller: 'reference' });
    const limp = await runCase(mj, kase, robot(), { controller: 'limp' });

    expect(reference.passed).toBe(true);
    expect(limp.passed).toBe(false);
    expect(reference.model.bodies.filter((body) => body.world?.some((id) => id.startsWith('imported-')))).toHaveLength(
      kitchen.asset.pieces.length,
    );
    expect(kase.world.imported?.hash).toBe(kitchen.hash);
  });

  it('keeps the table gap open for a rover to reach the spot beneath its top', async () => {
    const mj = await loadMujoco();
    const kase = built(kitchen, { distanceMm: 1200, radiusMm: 120, seconds: 12 });
    const result = await runCase(mj, kase, robot(), { controller: 'reference' });

    expect(kitchen.asset.pieces.length).toBeGreaterThanOrEqual(2);
    expect(kitchen.asset.pieces.length).toBeLessThanOrEqual(64);
    expect(result.passed).toBe(true);
    expect(result.case.world.objects.find((object) => object.id === 'spot')?.position[2]).toBeCloseTo(
      builder().pivot[2] + 1200,
    );
  });

  it('climbs the yard’s five-degree slope to reach the uphill spot', async () => {
    const mj = await loadMujoco();
    const yard = await imported([yardCollider()]);
    const kase = built(yard, { distanceMm: 1800, radiusMm: 200, seconds: 18 });
    const result = await runCase(mj, kase, robot(), { controller: 'reference' });
    const root = result.model.bodies.findIndex((body) => body.name === result.model.robots[0].root);
    const rootHeights = result.frames.map((frame) => frame.poses[root * 7 + 2]);

    expect(result.passed).toBe(true);
    expect(Math.max(...rootHeights) - rootHeights[0]).toBeGreaterThan(0.08);
  });

  it('judges a quadruped’s Walk Without Falling run in the stairwell', async () => {
    const mj = await loadMujoco();
    const stairs = await imported([stairwellCollider()]);
    const kase = built(stairs, { distanceMm: 1400, seconds: 14 }, 'quad-servo');
    const result = await runCase(mj, kase, robot('quad-servo'), { controller: 'reference' });
    const judged = await evaluateContract(kase.task.contract, result.trace);

    expect(result.frames.length).toBeGreaterThan(1);
    expect(Number.isFinite(result.margin)).toBe(true);
    expect(result.passed).toBe(judged.passed);
    expect(result.margin).toBe(judged.margin);
    expect(result.failed).toEqual(judged.failed);
    expect(result.model.bodies.filter((body) => body.world?.some((id) => id.startsWith('imported-')))).toHaveLength(
      stairs.asset.pieces.length,
    );
    expect(Object.values(result.trace.signals).every((signal) => signal.length > 1)).toBe(true);
  });
});

describe('world placement and compatibility', () => {
  it('keeps the robot start clear of every collider in its height band', () => {
    const rover = builder();
    const start = openWorldSpot(kitchen.asset, rover)!;
    const clearance = routeClearance(rover);

    expect(start).not.toBeNull();

    for (const piece of kitchen.asset.pieces) {
      const values = Array.from(piece.positions);
      const axis = (n: number) => values.filter((_, i) => i % 3 === n);
      const low = [0, 1, 2].map((n) => Math.min(...axis(n)));
      const high = [0, 1, 2].map((n) => Math.max(...axis(n)));

      if (high[1] <= 0.5 || low[1] >= rover.heightMm) continue;

      expect(
        start[0] < low[0] - clearance ||
          start[0] > high[0] + clearance ||
          start[2] < low[2] - clearance ||
          start[2] > high[2] + clearance,
      ).toBe(true);
    }
  });

  it('gives the same collision pieces and start for the same dropped files', async () => {
    const again = await imported([kitchenCollider(), kitchenSplat()]);

    expect(again.hash).toBe(kitchen.hash);
    expect(again.asset.pieces).toEqual(kitchen.asset.pieces);
    expect(openWorldSpot(again.asset, builder())).toEqual(openWorldSpot(kitchen.asset, builder()));
  });

  it('keeps the RoomPlan reader result unchanged', async () => {
    const text = JSON.stringify(fixtureRoom());
    const read = await readWorldFiles([{ name: 'Fixture Flat.json', bytes: new TextEncoder().encode(text) }]);

    expect(read).toEqual({ kind: 'room', room: readRoomPlan(text, 'Fixture Flat.json') });
  });
});
