import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { bodyAnalysisScenario, BODY_ANALYSIS_SCENARIOS } from './bodyAnalysisMatrix.fixtures';
import { replayBody, replayBodies, BodyReplayStopped } from './bodyReplay';
import { bodyMotionPlans } from './bodyMotionPlans';
import { emptyBodyFit } from './bodyParameters';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

it.each(BODY_ANALYSIS_SCENARIOS)('resets a reused engine exactly between independent %s plans', async (name) => {
  const { request } = await bodyAnalysisScenario(mj, name);
  const plans = bodyMotionPlans(request).slice(0, 2);
  const runs = plans.map((plan) => plan.run);
  const input = { ...request, mj, runs: [...runs, ...runs] };
  const before = structuredClone(runs);
  const actual = replayBodies(input, emptyBodyFit());
  const expected = runs.map((run) => replayBody({ ...request, mj, run }, emptyBodyFit()));

  expect(actual).toEqual([...expected, ...expected]);
  expect(runs).toEqual(before);
});

it('spends one budget across reused plans and refuses cancellation', async () => {
  const { request } = await bodyAnalysisScenario(mj, 'single-link arm');
  const runs = bodyMotionPlans(request).map((plan) => plan.run);
  const input = { ...request, mj, runs };

  expect(() => replayBodies({ ...input, budget: { remainingSteps: 1 } }, emptyBodyFit())).toThrow(BodyReplayStopped);
  expect(() =>
    replayBodies({ ...input, budget: { remainingSteps: 1000, cancelled: () => true } }, emptyBodyFit()),
  ).toThrow(BodyReplayStopped);
});
