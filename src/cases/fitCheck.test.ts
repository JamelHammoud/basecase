import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { caseRow } from '../readiness/caseChecks';
import { fixtureMeasures } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { FixtureRobot } from '../sim/fixtures/parts';
import { buildRig } from '../utils/kinematics';
import { CaseCheckSession, type CaseCheckReply, type WireRobot } from './caseCheckJob';
import { summarizeRuns } from './caseRuns';
import { robotFacts, slotRefusal } from './robotFit';
import { caseSlots, type Case } from './schema';
import { caseRobot, presetCase } from './testing';

const SIM_MS = 60_000;

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const flat = (robot: FixtureRobot): FixtureRobot => ({
  ...robot,
  id: `${robot.id}-flat`,
  joints: robot.joints.map((j, i) => (i === 0 ? { ...j, axis: [0, 0, 0] } : j)),
});

function wire(robot: FixtureRobot): WireRobot {
  const triangles = caseRobot(robot).partTriangles;

  return {
    id: robot.id,
    parts: robot.parts,
    joints: robot.joints,
    measures: fixtureMeasures(robot.parts),
    triangles: Object.fromEntries(robot.parts.flatMap((p) => (triangles(p.id) ? [[p.id, triangles(p.id)!]] : []))),
  };
}

async function rowOf(robot: FixtureRobot, kase: Case) {
  const mj = await loadMujoco();
  const session = new CaseCheckSession();
  const model = (await session.run(mj, { type: 'model', robot: wire(robot), walks: [] })) as Extract<
    CaseCheckReply,
    { type: 'model' }
  >;
  const job = { type: 'runs' as const, kase, modelHash: model.modelHash, walk: null, stop: model.stop, seeds: [1] };
  const runs = (await session.run(mj, job)) as Extract<CaseCheckReply, { type: 'runs' }>;

  return caseRow(kase, summarizeRuns([runs.result]));
}

const refusalOf = (robot: FixtureRobot, kase: Case) =>
  slotRefusal(caseSlots(kase)[0], robotFacts(buildRig(robot.joints, robot.parts), robot.parts));

describe('a Case’s Checks row runs the robot’s fit first', () => {
  const groundCase = presetCase(fixture('rover-diff'), 'reach-the-flag');

  it(
    'says a biped doesn’t fit a ground Case, in the slot’s words, and offers New Case',
    async () => {
      const biped = fixture('biped-servo');
      const row = await rowOf(biped, groundCase);

      expect(row).toMatchObject({ status: 'fail', detail: '' });
      expect(row.items).toEqual([{ text: refusalOf(biped, groundCase), status: 'fail', fix: { kind: 'new-case' } }]);
    },
    SIM_MS,
  );

  it(
    'says a robot whose model doesn’t compile doesn’t compile, and only once it fits',
    async () => {
      const broken = flat(fixture('arm-3dof'));
      const own = await rowOf(broken, presetCase(fixture('arm-3dof'), 'touch-the-dots'));
      const misfit = await rowOf(broken, groundCase);

      expect(own.status).toBe('fail');
      expect(own.items).toEqual([{ text: expect.stringMatching(/axis too small/), status: 'fail' }]);
      expect(misfit.items?.[0]).toMatchObject({ text: refusalOf(broken, groundCase), fix: { kind: 'new-case' } });
    },
    SIM_MS,
  );

  it(
    'says the weak quadruped falls on its walk, and only once it fits',
    async () => {
      const weak = fixture('must-fail-weak-quad');
      const own = await rowOf(weak, presetCase(weak, 'reach-the-flag'));
      const misfit = await rowOf(weak, groundCase);

      expect(own).toMatchObject({ status: 'fail', detail: '', items: [{ text: 'Falls on its walk', status: 'fail' }] });
      expect(misfit.items?.[0]?.text).toBe(refusalOf(weak, groundCase));
    },
    SIM_MS,
  );

  it(
    'runs a robot that fits, compiles, stands and walks',
    async () => {
      const quad = fixture('quad-servo');
      const row = await rowOf(quad, presetCase(quad, 'reach-the-flag'));

      expect(row.detail).toBe('1 of 1');
    },
    SIM_MS,
  );
});
