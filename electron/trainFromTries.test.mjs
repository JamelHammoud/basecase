import loadMujoco from '@mujoco/mujoco';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { runCaseTimes } from '../src/cases/caseRuns';
import { caseRunner } from '../src/cases/runCase';
import { caseRobot } from '../src/cases/testing';
import { newDataset } from '../src/datasets/datasetFile';
import { splitOf } from '../src/datasets/datasetSplit';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { isPolicySpec } from '../src/sim/policy';
import { TRIES_JOINT_NOISE_DEG, TRIES_RUNS, triesJob } from '../src/skills/triesTraining';
import { buildRig } from '../src/utils/kinematics';
import { forgeBinary, writeJobFolder } from './trainer.mjs';

const FORGE = forgeBinary(process.env, undefined);
const TRIES = 10;
const KEPT = 29;
const arm = fixtureRobots().find((r) => r.id === 'arm-3dof');

function touchAPoint() {
  const made = buildCase({ goal: 'touch', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

  if (!made.ok) throw new Error(made.problem);

  return made.kase;
}

async function scriptedTries(mj, kase) {
  const runner = caseRunner(mj, kase, caseRobot(arm), {
    controller: 'reference',
    record: true,
    jointNoiseDeg: TRIES_JOINT_NOISE_DEG,
  });
  const recordings = [];
  let model = null;

  for (let seed = 1; recordings.length < TRIES && seed <= 3 * TRIES; seed++) {
    const result = await runner.run(seed);

    if (result.passed && result.recording) recordings.push(result.recording);

    model = result.model;
  }

  return { recordings, model };
}

function datasetOrder(kase, recordings) {
  const ids = recordings.map((_, i) => `try-${i + 1}`);
  const dataset = newDataset({ id: 'dataset-touch', name: kase.name, task: kase.brief, members: ids, at: 'now' });

  return splitOf(dataset.members, dataset.seed).order.map((id) => recordings[ids.indexOf(id)]);
}

function forgeTrain(job) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-'));

  writeJobFolder(dir, { xml: job.xml, job: { ...job.job, seed: 1 } });

  const run = spawnSync(FORGE, ['--job', dir], { encoding: 'utf8' });

  if (run.status !== 0) throw new Error(run.stderr);

  const policy = JSON.parse(fs.readFileSync(path.join(dir, 'policy.json'), 'utf8'));

  if (!isPolicySpec(policy)) throw new Error('Forge wrote no policy.');

  return policy;
}

function shuffledActions(job) {
  const { episodes } = job.job.demos;
  const actions = episodes.flatMap((e) => e.actions);
  let state = 7;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;

    return state / 2147483648;
  };

  for (let i = actions.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));

    [actions[i], actions[j]] = [actions[j], actions[i]];
  }

  let at = 0;
  const shuffled = episodes.map((e) => ({ obs: e.obs, actions: e.obs.map(() => actions[at++]) }));

  return { ...job, job: { ...job.job, demos: { episodes: shuffled } } };
}

describe.skipIf(!FORGE)('a policy cloned from tries by Forge', () => {
  it('passes Touch a Point on arm-3dof in 29 or more of 32 randomized runs from a dataset of its tries, and not from shuffled actions', async () => {
    const mj = await loadMujoco();
    const kase = touchAPoint();
    const { recordings, model } = await scriptedTries(mj, kase);
    const job = triesJob(model, kase, datasetOrder(kase, recordings));
    const judge = (policy) =>
      runCaseTimes(mj, kase, caseRobot(arm), {
        controller: 'policy',
        policy,
        jointNoiseDeg: TRIES_JOINT_NOISE_DEG,
        runs: TRIES_RUNS,
      });

    expect(recordings).toHaveLength(TRIES);
    expect((await judge(forgeTrain(job))).passes).toBeGreaterThanOrEqual(KEPT);
    expect((await judge(forgeTrain(shuffledActions(job)))).passes).toBeLessThan(KEPT);
  }, 600_000);
});
