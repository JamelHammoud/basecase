import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { liveController, runCase } from '../cases/testing';
import { registerWorldAsset, hashWorldAsset, type WorldAsset } from '../cases/worldAssets';
import { readMcap } from '../datasets/import/recordingFiles';
import { SimEngine } from '../sim/engine';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { corridorMcap } from './mapFixtures';
import { reconstructMapWorld } from './mapWorld';

const rover = fixtureRobots().find((robot) => robot.id === 'rover-diff')!;
const rig = buildRig(rover.joints, rover.parts);
let imported: { hash: string; asset: WorldAsset };

beforeAll(async () => {
  const [recording] = (await readMcap([{ name: 'corridor.mcap', bytes: await corridorMcap() }])).episodes;
  const asset = await reconstructMapWorld({
    topics: recording.topics!,
    name: 'Map',
    sourceTry: 'corridor',
    matching: true,
  });
  const hash = await hashWorldAsset(asset);

  registerWorldAsset(hash, asset);
  imported = { hash, asset };
});

describe('driving a reconstructed world', () => {
  it('passes a seeded reference rover, fails without drive, and stops a commanded rover at the corridor wall', async () => {
    const made = buildCase(
      { goal: 'reach', world: 'imported', imported, values: { distanceMm: 600, radiusMm: 150, seconds: 8 } },
      builderRobot(rig, rover.parts),
    );

    if (!made.ok) throw new Error(made.problem);

    const mj = await loadMujoco();
    const passed = await runCase(mj, made.kase, rover, { controller: 'reference', seed: 17 });
    const limp = await runCase(mj, made.kase, rover, { controller: 'limp', seed: 17 });

    expect(
      passed.passed,
      JSON.stringify({
        failed: passed.failed,
        margin: passed.margin,
        refusal: passed.refusal,
        world: made.kase.world,
        last: passed.frames.at(-1)?.poses.slice(0, 7),
      }),
    ).toBe(true);
    expect(limp.passed).toBe(false);
    expect(passed.model.bodies.filter((body) => body.world?.some((id) => id.startsWith('imported-')))).toHaveLength(
      imported.asset.pieces.length,
    );

    const engine = new SimEngine(mj, passed.model);

    try {
      engine.setController(liveController(rover, rig, passed.model));
      engine.command({ v: [0, 0, 1] });

      for (let step = 0; step < 500; step++) engine.step(0.02);

      const root = passed.model.bodies.findIndex((body) => body.name === passed.model.robots[0].root);
      const position = engine.poses().subarray(root * 7, root * 7 + 3);

      expect(position.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(position[0], position[1])).toBeLessThan(2);
    } finally {
      engine.dispose();
    }
  });
});
