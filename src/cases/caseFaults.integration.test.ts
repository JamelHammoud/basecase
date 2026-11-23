import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { caseRow, faultRow } from '../readiness/caseChecks';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot, type CaseSpec } from './caseBuilder';
import { faultRefusal, type CaseFault } from './caseFaults';
import { runCaseTimes, runSeeds } from './caseRuns';
import { caseRunner } from './runCase';
import { seedReplay } from './seedReplay';
import { caseRobot } from './testing';
import { tryManifest } from './tries';
import type { Case } from './schema';

const SIM_MS = 120_000;
const RUNS = 6;

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

function caseOn(robotId: string, spec: Pick<CaseSpec, 'goal' | 'world'>): Case {
  const robot = fixture(robotId);
  const made = buildCase(spec, builderRobot(buildRig(robot.joints, robot.parts), robot.parts));

  if (!made.ok) throw new Error(made.problem);

  return made.kase;
}

interface Scenario {
  name: string;
  robot: string;
  spec: Pick<CaseSpec, 'goal' | 'world'>;
  fault: CaseFault;
  survives: boolean;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'a limp knee fails the quadruped’s Walk Without Falling',
    robot: 'quad-servo',
    spec: { goal: 'walk', world: 'floor' },
    fault: { joint: 'leg0_bend', kind: 'limp' },
    survives: false,
  },
  {
    name: 'a limp hip fails the quadruped’s Walk Without Falling',
    robot: 'quad-servo',
    spec: { goal: 'walk', world: 'floor' },
    fault: { joint: 'leg0_swing', kind: 'limp' },
    survives: false,
  },
  {
    name: 'the hexapod passes on five legs with a limp knee',
    robot: 'hexapod',
    spec: { goal: 'walk', world: 'floor' },
    fault: { joint: 'leg0_bend', kind: 'limp' },
    survives: true,
  },
  {
    name: 'a weak shoulder still picks up the block',
    robot: 'arm-6dof',
    spec: { goal: 'pick', world: 'floor' },
    fault: { joint: 'arm1', kind: 'weak' },
    survives: true,
  },
  {
    name: 'a stuck wrist can’t pick up the block',
    robot: 'arm-6dof',
    spec: { goal: 'pick', world: 'floor' },
    fault: { joint: 'arm5', kind: 'stuck' },
    survives: false,
  },
  {
    name: 'a laggy wheel still reaches the flag',
    robot: 'rover-diff',
    spec: { goal: 'reach', world: 'floor' },
    fault: { joint: 'left_wheel', kind: 'laggy' },
    survives: true,
  },
  {
    name: 'a limp wheel doesn’t reach the flag',
    robot: 'rover-diff',
    spec: { goal: 'reach', world: 'floor' },
    fault: { joint: 'left_wheel', kind: 'limp' },
    survives: false,
  },
];

describe('a Case’s fault in seeded runs, on real MuJoCo', () => {
  it.each(SCENARIOS)(
    '$name, the same on a second run',
    async ({ robot, spec, fault, survives }) => {
      const mj = await loadMujoco();
      const kase = caseOn(robot, spec);
      const options = { runs: RUNS, fault };
      const first = await runCaseTimes(mj, kase, caseRobot(fixture(robot)), options);
      const second = await runCaseTimes(mj, kase, caseRobot(fixture(robot)), options);
      const intact = await runCaseTimes(mj, kase, caseRobot(fixture(robot)), { runs: RUNS });
      const row = faultRow(fault, fault.joint, first);

      expect(first.refusal).toBeNull();
      expect(first.runs).toBe(RUNS);
      expect(second.outcomes.map((o) => [o.seed, o.passed, o.margin, o.failed])).toEqual(
        first.outcomes.map((o) => [o.seed, o.passed, o.margin, o.failed]),
      );
      expect(first.outcomes.map((o) => o.margin)).not.toEqual(intact.outcomes.map((o) => o.margin));
      expect(first.passes >= intact.passes).toBe(survives);
      expect(row.status === 'pass').toBe(survives && intact.passes === RUNS);
      expect(row.detail).toBe(`${first.passes} of ${RUNS}`);
    },
    SIM_MS,
  );

  it(
    'refuses a fault on a joint the robot doesn’t have, without running a seed',
    async () => {
      const mj = await loadMujoco();
      const robot = fixture('quad-servo');
      const kase = caseOn('quad-servo', { goal: 'walk', world: 'floor' });
      const fault: CaseFault = { joint: 'leg9_bend', kind: 'limp' };
      const runs = await runCaseTimes(mj, kase, caseRobot(robot), { runs: RUNS, fault });
      const seeded = await runSeeds(mj, kase, caseRobot(robot), { seeds: [1], fault });
      const row = faultRow(fault, 'Knee 9', runs);

      expect(runs).toMatchObject({ runs: 0, passes: 0, refusal: faultRefusal('leg9_bend'), misfit: false });
      expect(seeded).toEqual({ refusal: faultRefusal('leg9_bend'), misfit: false });
      expect(row).toMatchObject({ status: 'fail', detail: '', refusal: 'leg9_bend isn’t a servo on this robot.' });
    },
    SIM_MS,
  );

  it(
    'refuses a Case whose robot lost the actuator since the fault was added',
    async () => {
      const mj = await loadMujoco();
      const quad = fixture('quad-servo');
      const kase = caseOn('quad-servo', { goal: 'walk', world: 'floor' });
      const fault: CaseFault = { joint: 'leg0_bend', kind: 'limp' };
      const trimmed = { ...caseRobot(quad), joints: quad.joints.filter((j) => j.id !== fault.joint) };
      const runs = await runCaseTimes(mj, kase, trimmed, { runs: RUNS, fault });

      expect(runs.refusal).toBe(faultRefusal(fault.joint));
    },
    SIM_MS,
  );

  it(
    'gives a Case with no fault exactly the verdicts it gave before, even when it carries a list',
    async () => {
      const mj = await loadMujoco();
      const robot = caseRobot(fixture('quad-servo'));
      const kase = caseOn('quad-servo', { goal: 'walk', world: 'floor' });
      const listed: Case = { ...kase, faults: [{ joint: 'leg0_bend', kind: 'limp' }] };
      const plain = await runCaseTimes(mj, kase, robot, { runs: RUNS });
      const named = await runCaseTimes(mj, listed, robot, { runs: RUNS, fault: undefined });
      const bare = await runCaseTimes(mj, listed, robot, { runs: RUNS });
      const summary = (runs: typeof plain) =>
        JSON.stringify({ ...runs, outcomes: runs.outcomes.map((o) => ({ ...o, path: Array.from(o.path) })) });

      expect(summary(named)).toBe(summary(plain));
      expect(summary(bare)).toBe(summary(plain));
      expect(caseRow(kase, plain)).toEqual(caseRow(listed, bare));
    },
    SIM_MS,
  );

  it(
    'replays a failing seed with the same broken servo, in the recording, its efforts and a saved try',
    async () => {
      const mj = await loadMujoco();
      const quad = fixture('quad-servo');
      const robot = caseRobot(quad);
      const kase = caseOn('quad-servo', { goal: 'walk', world: 'floor' });
      const fault: CaseFault = { joint: 'leg0_bend', kind: 'limp' };
      const options = { controller: 'reference' as const, fault };
      const plain = await caseRunner(mj, kase, robot, { controller: 'reference', record: true }).run(2);
      const result = await caseRunner(mj, kase, robot, { ...options, record: true }).run(2);
      const replay = await seedReplay(mj, result, 2);
      const joint = result.model.joints.findIndex((j) => j.id === fault.joint);
      const again = await caseRunner(mj, kase, robot, { ...options, record: true }).run(2);

      expect(result.passed).toBe(false);
      expect(plain.passed).toBe(true);
      expect(result.recording!.faults).toEqual([{ joint: 'leg0_bend', kind: 'limp', at: 0 }]);
      expect(plain.recording!.faults).toEqual([]);
      expect(again.recording!.qpos).toEqual(result.recording!.qpos);
      expect(Math.max(...replay.efforts.forces[joint])).toBe(0);
      expect(replay.trips.length).toBeGreaterThan(0);
      expect((await tryManifest(replay.kase, replay.model, replay.recording)).faults).toEqual(result.recording!.faults);
    },
    SIM_MS,
  );
});
