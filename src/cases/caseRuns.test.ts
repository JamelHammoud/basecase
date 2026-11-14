import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { caseFindings, caseRow } from '../readiness/caseChecks';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { FixtureRobot } from '../sim/fixtures/parts';
import { obsSize, POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from '../sim/policy';
import { modelOf } from '../skills/fixtureModels';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot, CASE_PRESETS, presetsFor, type PresetId } from './caseBuilder';
import * as THREE from 'three';
import { SimEngine } from '../sim/engine';
import { framePoses } from '../sim/recorder';
import { fitsRecording } from '../sim/recordedFrames';
import { recordSeed } from './caseCheckJob';
import { caseRunner, RECORD_DT } from './runCase';
import { caseRandom, jitteredWorld } from './caseRandom';
import { CASE_RUNS, runCaseTimes, runSeeds, summarizeRuns } from './caseRuns';
import { PATH_HZ } from './runPath';
import type { Case } from './schema';
import { caseRobot, presetCase, stagedModel, touchTheDots } from './testing';

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const template = (robot: FixtureRobot, id: PresetId): Case => presetCase(robot, id);

const withWheelEffort = (robot: FixtureRobot, effortNm: number): FixtureRobot => ({
  ...robot,
  joints: robot.joints.map((j) => ({ ...j, effortNm })),
});

const SMALL_GEAR_MOTOR_NM = 0.25;
const SIM_MS = 30_000;

describe('seeded Case runs', () => {
  it(
    'give the same result for the same seed, and vary between seeds',
    async () => {
      const mj = await loadMujoco();
      const rover = fixture('rover-diff');
      const runner = caseRunner(mj, template(rover, 'reach-the-flag'), caseRobot(rover), { controller: 'reference' });
      const [a, again, other] = [await runner.run(7), await runner.run(7), await runner.run(8)];

      expect(again.margin).toBe(a.margin);
      expect(again.passed).toBe(a.passed);
      expect(other.margin).not.toBe(a.margin);
      expect(again.path).toEqual(a.path);
      expect(other.path).not.toEqual(a.path);
    },
    SIM_MS,
  );

  it(
    'jitter where dynamic world objects start, the same way for the same seed',
    async () => {
      const mj = await loadMujoco();
      const rover = fixture('rover-four');
      const made = buildCase(
        { goal: 'push', world: 'floor' },
        builderRobot(buildRig(rover.joints, rover.parts), rover.parts),
      );

      if (!made.ok) throw new Error(made.problem);

      const kase = made.kase;
      const at = (c: Case, id: string) => c.world.objects.find((o) => o.id === id)!.position;
      const jittered = (seed: number) => jitteredWorld(kase, caseRandom(seed));
      const runner = caseRunner(mj, kase, caseRobot(rover), { controller: 'limp' });
      const [three, four] = [await runner.run(3), await runner.run(4)];

      expect(at(jittered(3), 'box')).toEqual(at(jittered(3), 'box'));
      expect(at(jittered(3), 'box')).not.toEqual(at(jittered(4), 'box'));
      expect(at(jittered(3), 'goal')).toEqual(at(jittered(4), 'goal'));
      expect(at(three.case, 'box')).not.toEqual(at(four.case, 'box'));
      expect(at(three.case, 'goal')).toEqual(at(four.case, 'goal'));
    },
    SIM_MS,
  );

  const presetsOf = (robot: FixtureRobot) => presetsFor(builderRobot(buildRig(robot.joints, robot.parts), robot.parts));
  const limpRuns = ['arm-3dof', 'rover-diff'].flatMap((robot) =>
    presetsOf(fixture(robot)).map((id) => ({ robot, template: id })),
  );

  it('a limp robot is tried on every template', () => {
    const every = Object.keys(CASE_PRESETS);

    expect(new Set(limpRuns.map((r) => r.template))).toEqual(new Set(every));
  });

  it.each(limpRuns)(
    'a limp $robot gets 0 of 20 on $template',
    async ({ robot, template: id }) => {
      const mj = await loadMujoco();
      const r = fixture(robot);
      const runs = await runCaseTimes(mj, template(r, id), caseRobot(r), { controller: 'limp' });

      expect(runs.runs).toBe(CASE_RUNS);
      expect(runs.passes).toBe(0);
      expect(runs.commonFailure).toBe('missed');
    },
    SIM_MS,
  );

  it(
    'the fixture rover reaches the flag at least 18 of 20 times with randomization on',
    async () => {
      const mj = await loadMujoco();
      const rover = fixture('rover-diff');
      const runs = await runCaseTimes(mj, template(rover, 'reach-the-flag'), caseRobot(rover));

      expect(runs.passes).toBeGreaterThanOrEqual(18);
      expect(caseRow({ id: 'reach-the-flag', name: 'Reach the Flag' }, runs)).toMatchObject({ status: 'pass' });
    },
    SIM_MS,
  );

  it(
    'a robot that doesn’t fit gets a failing row that says why',
    async () => {
      const mj = await loadMujoco();
      const arm = fixture('arm-3dof');
      const flag = template(fixture('rover-diff'), 'reach-the-flag');
      const runs = await runCaseTimes(mj, flag, caseRobot(arm));
      const row = caseRow(flag, runs);
      const [finding] = caseFindings([row]);

      expect(runs.refusal).toMatch(/wheels/);
      expect(row).toMatchObject({ status: 'fail', detail: '', caseId: 'reach-a-spot' });
      expect(finding).toMatchObject({
        level: 'note',
        check: 'Reach a Spot',
        text: runs.refusal,
        fix: { kind: 'new-case' },
      });
    },
    SIM_MS,
  );

  describe('seeded fault: cutting a rover’s wheel motors to 30% turns its row from pass to fail', () => {
    const rover = withWheelEffort(fixture('rover-diff'), SMALL_GEAR_MOTOR_NM);
    const flag = template(rover, 'reach-the-flag');

    it.each([
      { motors: 'full', robot: rover, status: 'pass' },
      { motors: '30%', robot: withWheelEffort(rover, SMALL_GEAR_MOTOR_NM * 0.3), status: 'fail' },
    ])(
      '$motors wheel motors read $status',
      async ({ robot, status }) => {
        const mj = await loadMujoco();

        expect(caseRow(flag, await runCaseTimes(mj, flag, caseRobot(robot))).status).toBe(status);
      },
      SIM_MS,
    );
  });
});

function holdPolicy(robot: FixtureRobot): PolicySpec {
  const model = modelOf(robot);
  const joints = model.joints.map((j) => j.id);
  const size = obsSize(joints.length);

  return {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'walk',
    robot: model.robots[0].key,
    joints,
    defaultPose: joints.map(() => 0),
    actionScale: 0.25,
    controlDt: 0.02,
    command: [0, 0, 0],
    obsMean: new Array<number>(size).fill(0),
    obsStd: new Array<number>(size).fill(1),
    layers: [
      { in: size, out: joints.length, w: new Array<number>(size * joints.length).fill(0), b: joints.map(() => 0) },
    ],
    activation: 'elu',
    trainedSteps: 0,
    mujoco: 'none',
    createdAt: '2026-11-13T00:00:00.000Z',
  };
}

describe('a seeded run’s path and replay', () => {
  const weakRover = withWheelEffort(fixture('rover-diff'), SMALL_GEAR_MOTOR_NM * 0.3);
  const flag = template(weakRover, 'reach-the-flag');
  const spread = (path: Float32Array) => {
    const points = Array.from({ length: path.length / 3 }, (_, i) => new THREE.Vector3().fromArray(path, i * 3));

    return new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3()).length();
  };

  it(
    'a failing seed’s recorded re-run gives its summary’s verdict, path and first trip, on a model the timeline accepts',
    async () => {
      const mj = await loadMujoco();
      const robot = caseRobot(weakRover);
      const ran = await runSeeds(mj, flag, robot, { seeds: [1, 2, 3] });

      if (!('outcomes' in ran)) throw new Error(ran.refusal);

      const outcome = ran.outcomes.find((o) => !o.passed)!;
      const recorded = await recordSeed(mj, { kase: flag, modelHash: 'm', seed: outcome.seed, walk: null }, robot);
      const plain = await caseRunner(mj, flag, robot, { controller: 'reference' }).run(outcome.seed);
      const again = await caseRunner(mj, flag, robot, { controller: 'reference', record: true }).run(outcome.seed);
      const last = plain.frames.length - 1;
      const engine = new SimEngine(mj, stagedModel(flag, weakRover).model);

      expect(again).toMatchObject({ passed: outcome.passed, margin: outcome.margin, path: outcome.path });
      expect(recorded.trips[0] ?? null).toEqual(outcome.trip);
      expect(recorded.recording.frames).toBeGreaterThanOrEqual(plain.frames.length);
      expect(framePoses(recorded.recording, last)).toEqual(
        Float64Array.from(Float32Array.from(plain.frames[last].poses)),
      );
      expect(fitsRecording(engine, recorded.recording)).toBe(true);
      engine.dispose();
    },
    SIM_MS,
  );

  it('the weak quadruped fails Walk Without Falling, mostly by falling', async () => {
    const mj = await loadMujoco();
    const quad = fixture('must-fail-weak-quad');
    const made = buildCase(
      { goal: 'walk', world: 'floor' },
      builderRobot(buildRig(quad.joints, quad.parts), quad.parts),
    );

    if (!made.ok) throw new Error(made.problem);

    const runs = await runCaseTimes(mj, made.kase, caseRobot(quad));
    const row = caseRow(made.kase, runs);
    const fell = runs.trails.filter((t) => t.trip?.label === 'fell');
    const frames = made.kase.task.seconds / RECORD_DT;

    expect(runs.passes).toBeLessThan(10);
    expect(row.status).toBe('fail');
    expect(row.items?.[0]?.text).toBe('Fell');
    expect(row.trails).toHaveLength(CASE_RUNS);
    expect(fell.length).toBeGreaterThan(CASE_RUNS / 2);
    expect(fell.every((t) => !t.passed && t.trip!.frame > 0 && t.trip!.frame < frames)).toBe(true);
    expect(runs.trails.filter((t) => t.passed).every((t) => t.trip === null)).toBe(true);
  }, 60_000);

  it(
    'an arm’s path follows its end effector, not its fixed base',
    async () => {
      const mj = await loadMujoco();
      const arm = fixture('arm-3dof');
      const run = await caseRunner(mj, touchTheDots(arm), caseRobot(arm), { controller: 'reference' }).run(1);

      expect(run.path).toHaveLength(Math.ceil(run.frames.length / (1 / (PATH_HZ * RECORD_DT))) * 3);
      expect(spread(run.path)).toBeGreaterThan(20);
    },
    SIM_MS,
  );
});

describe('a ready Walk drives every robot that moves around, as Drive picks it', () => {
  const walkCase = (robot: FixtureRobot): Case => {
    const made = buildCase(
      { goal: 'walk', world: 'floor' },
      builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
    );

    if (!made.ok) throw new Error(made.problem);

    return made.kase;
  };

  it.each([
    { robot: 'biped-servo', without: 'limp' },
    { robot: 'wheel-legged', without: 'drive' },
    { robot: 'quad-servo', without: 'drive' },
  ])(
    '$robot walks with its policy, and without one is $without',
    async ({ robot: id, without }) => {
      const mj = await loadMujoco();
      const robot = fixture(id);
      const kase = walkCase(robot);
      const walk = { policy: holdPolicy(robot), topSpeed: 0.2 };
      const walking = caseRunner(mj, kase, caseRobot(robot), { controller: 'reference', walk });

      expect(walking.controller).toBe('policy');
      expect(caseRunner(mj, kase, caseRobot(robot), { controller: 'reference' }).controller).toBe(without);
      expect((await walking.run(1)).frames.length).toBeGreaterThan(0);
    },
    SIM_MS,
  );

  it(
    'a fixed arm ignores the Walk',
    async () => {
      const mj = await loadMujoco();
      const arm = fixture('arm-3dof');
      const touch = template(arm, 'touch-the-dots');
      const runner = caseRunner(mj, touch, caseRobot(arm), {
        controller: 'reference',
        walk: { policy: holdPolicy(arm), topSpeed: 0.2 },
      });

      expect(runner.controller).toBe('drive');
    },
    SIM_MS,
  );
});

describe('summarizing runs', () => {
  let seed = 0;
  const run = (passed: boolean, margin: number, failed: string[] = []) => ({
    seed: ++seed,
    passed,
    margin,
    failed,
    path: new Float32Array([0, 0, seed]),
    trip: failed.length ? { label: failed[0], frame: seed } : null,
  });

  it('counts passes across batches, takes the median margin, ranks failures and finds the worst run', () => {
    seed = 0;

    const first = { outcomes: [run(true, 0.4), run(false, -0.2, ['fell', 'fell']), run(false, -0.6)] };
    const second = { outcomes: [run(false, -0.1, ['fell', 'stopped']), run(true, 0.8)] };
    const { trails, ...summary } = summarizeRuns([first, second]);

    expect(trails.map((t) => [t.seed, t.passed, t.trip?.frame ?? null, t.path[2]])).toEqual([
      [1, true, null, 1],
      [2, false, 2, 2],
      [3, false, null, 3],
      [4, false, 4, 4],
      [5, true, null, 5],
    ]);
    expect(summary).toEqual({
      runs: 5,
      passes: 2,
      medianMargin: -0.1,
      worstMargin: -0.6,
      commonFailure: 'fell',
      failures: [
        { label: 'fell', runs: 2 },
        { label: 'missed', runs: 1 },
        { label: 'stopped', runs: 1 },
      ],
      worstSeed: 3,
      refusal: null,
      misfit: false,
    });
  });

  it('takes the lowest margin as the worst run when every run passes', () => {
    seed = 0;

    expect(summarizeRuns([{ outcomes: [run(true, 0.4), run(true, 0.1), run(true, 0.9)] }]).worstSeed).toBe(2);
  });

  it('reads a refusal from any batch', () => {
    expect(summarizeRuns([{ refusal: 'No wheels.', misfit: true }])).toMatchObject({
      refusal: 'No wheels.',
      misfit: true,
    });
  });
});
