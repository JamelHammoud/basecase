import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureMeasures } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { CaseCheckSession, type WireRobot } from './caseCheckJob';
import { caseWorkerCount } from './caseChecksClient';
import { seedBatches } from './caseRuns';
import { caseTemplates } from './templates';
import { caseRobot } from './testing';

const SIM_MS = 30_000;

function wire(id: string, rename = ''): WireRobot {
  const robot = fixtureRobots().find((r) => r.id === id)!;
  const triangles = caseRobot(robot).partTriangles;
  const parts = robot.parts.map((p) => ({ ...p, name: `${p.name}${rename}` }));

  return {
    id,
    parts,
    joints: robot.joints,
    measures: fixtureMeasures(parts),
    triangles: Object.fromEntries(parts.flatMap((p) => (triangles(p.id) ? [[p.id, triangles(p.id)!]] : []))),
  };
}

describe('the Case checks worker job', () => {
  it(
    'hashes the robot’s model, ignoring a rename and noticing a weaker motor',
    async () => {
      const mj = await loadMujoco();
      const session = new CaseCheckSession();
      const hash = async (robot: WireRobot) =>
        ((await session.run(mj, { type: 'model', robot, walks: [] })) as { modelHash: string }).modelHash;
      const rover = wire('rover-diff');
      const weaker = { ...rover, joints: rover.joints.map((j) => ({ ...j, effortNm: 0.1 })) };

      expect(await hash(wire('rover-diff', ' renamed'))).toBe(await hash(rover));
      expect(await hash(weaker)).not.toBe(await hash(rover));
    },
    SIM_MS,
  );

  it(
    'runs batches of seeds on the robot it was sent once, and refuses a model it never got',
    async () => {
      const mj = await loadMujoco();
      const robot = wire('rover-diff');
      const fixture = fixtureRobots().find((r) => r.id === 'rover-diff')!;
      const kase = caseTemplates(buildRig(fixture.joints, fixture.parts), fixture.parts)
        .find((t) => t.id === 'reach-the-flag')!
        .build();
      const session = new CaseCheckSession();
      const job = { type: 'runs' as const, kase, modelHash: 'rover', walk: null };
      const first = await session.run(mj, { ...job, robot, seeds: [1] });
      const again = await session.run(mj, { ...job, seeds: [2] });

      expect(first).toMatchObject({ type: 'runs', result: { outcomes: [{ passed: true }] } });
      expect(again).toMatchObject({ type: 'runs', result: { outcomes: [{ passed: true }] } });
      await expect(session.run(mj, { ...job, modelHash: 'other', seeds: [3] })).rejects.toThrow(/other/);
    },
    SIM_MS,
  );

  it('splits 20 seeds evenly across the workers', () => {
    expect(seedBatches(20, 4)).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15],
      [16, 17, 18, 19, 20],
    ]);
    expect(seedBatches(20, 3).map((b) => b.length)).toEqual([7, 7, 6]);
    expect([1, 2, 8, 32].map(caseWorkerCount)).toEqual([1, 1, 4, 4]);
  });
});
