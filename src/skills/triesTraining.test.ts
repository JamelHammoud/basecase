import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it, vi } from 'vitest';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { runCaseTimes, type CaseRuns } from '../cases/caseRuns';
import { caseRunner } from '../cases/runCase';
import { caseRobot } from '../cases/testing';
import { DEMO_CONTROL_DT } from '../datasets/demos';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { SimModel } from '../sim/mjcfTypes';
import { obsSize, POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from '../sim/policy';
import { buildRig } from '../utils/kinematics';
import type { SkillRecord } from './skillRecords';
import { skillRows } from './skillRows';
import { designOf, SkillsRuntime } from './skillsRuntime';
import type { TriesOutcome } from './triesRun';
import { TRIES_RUNS, triesJob } from './triesTraining';

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

function touchAPoint() {
  const made = buildCase({ goal: 'touch', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

  if (!made.ok) throw new Error(made.problem);

  return made.kase;
}

function holdPolicy(model: SimModel): PolicySpec {
  const joints = model.robots[0].joints;
  const size = obsSize(joints.length);

  return {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'stand',
    robot: model.robots[0].key,
    joints,
    defaultPose: joints.map(() => 0),
    actionScale: 0.25,
    controlDt: DEMO_CONTROL_DT,
    command: [0, 0, 0],
    obsMean: new Array<number>(size).fill(0),
    obsStd: new Array<number>(size).fill(1),
    layers: [
      { in: size, out: joints.length, w: new Array<number>(size * joints.length).fill(0), b: joints.map(() => 0) },
    ],
    activation: 'elu',
    trainedSteps: 1,
    mujoco: 'test',
    createdAt: '2026-11-13T00:00:00Z',
  };
}

const runsOf = (passes: number): CaseRuns => ({
  runs: TRIES_RUNS,
  passes,
  medianMargin: 0.1,
  worstMargin: 0.1,
  commonFailure: passes < TRIES_RUNS ? 'missed' : null,
  failures: passes < TRIES_RUNS ? [{ label: 'missed', runs: TRIES_RUNS - passes }] : [],
  worstSeed: 3,
  refusal: null,
  misfit: false,
});

async function scripted() {
  const mj = await loadMujoco();
  const kase = touchAPoint();
  const result = await caseRunner(mj, kase, caseRobot(arm), { controller: 'reference', record: true }).run(1);

  return { mj, kase, model: result.model, recording: result.recording! };
}

function runtimeWith(policy: PolicySpec) {
  const save = vi.fn(() => Promise.resolve());
  const records: SkillRecord[] = [];
  const runtime = new SkillsRuntime({
    runner: () => Promise.reject(new Error('unused')),
    forge: () => () => Promise.resolve({ ok: true, policy, events: [], stderr: '' }),
    save,
    loadSkill: () => Promise.resolve(null),
    onRecord: (r) => records.push(r),
    onChange: () => {},
  });

  return { runtime, save, records };
}

async function learn(passes: number) {
  const { kase, model, recording } = await scripted();
  const policy = holdPolicy(model);
  const { runtime, save, records } = runtimeWith(policy);
  const outcomes: TriesOutcome[] = [];
  const job = triesJob(model, kase, [recording, recording]);

  runtime.learnFromTries({
    model,
    kase,
    job,
    judge: () => Promise.resolve({ runs: runsOf(passes), robotModel: 'robot-model' }),
    done: (o) => outcomes.push(o),
  });
  await runtime.settled();

  return { kase, model, job, save, records, outcomes };
}

describe('training from tries', () => {
  it('sends Forge a behaviour cloning job with one demonstration per try', async () => {
    const { job, model } = await learn(32);
    const demos = job.job.demos as { episodes: Array<{ obs: number[][]; actions: number[][] }> };

    expect(job.job).toMatchObject({ algo: 'bc', controlDt: DEMO_CONTROL_DT, task: 'stand' });
    expect(job.xml).toBe(model.xml);
    expect(demos.episodes).toHaveLength(2);
    expect(demos.episodes[0].obs[0]).toHaveLength(obsSize(model.robots[0].joints.length));
  }, 30000);

  it('saves nothing when the policy passes fewer than 29 of 32 runs', async () => {
    const { save, records, outcomes } = await learn(28);

    expect(save).not.toHaveBeenCalled();
    expect(records).toEqual([]);
    expect(outcomes).toEqual([{ runs: runsOf(28), kept: false, problem: null }]);
  }, 30000);

  it('keeps a pass as a ready skill for the Case, which Train lists', async () => {
    const { kase, model, save, records, outcomes } = await learn(29);

    expect(save).toHaveBeenCalledTimes(1);
    expect(outcomes[0].kept).toBe(true);
    expect(records[0]).toMatchObject({ goal: kase.name, case: { id: kase.id, model: 'robot-model' }, kit: null });

    const rows = skillRows({ model, design: designOf(model), records, jobs: [] });
    const row = rows.find((r) => r.record === records[0]);

    expect(row?.state).toEqual({ kind: 'ready', arena: '29 of 32 tries, at least 77%' });
  }, 30000);

  it('runs a policy on a fixed arm, from start joints moved up to 5°', async () => {
    const { mj, kase, model } = await scripted();
    const held = await runCaseTimes(mj, kase, caseRobot(arm), {
      controller: 'policy',
      policy: holdPolicy(model),
      jointNoiseDeg: 5,
      runs: 2,
    });

    expect(held.refusal).toBeNull();
    expect(held.passes).toBe(0);
  }, 30000);
});
