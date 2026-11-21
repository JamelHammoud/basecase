import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { parkedBodyRun, colocatedBodyScenario } from './bodyMotion.fixtures';
import { analyzeBody } from './bodyAnalysis';
import { recommendBodyMotion } from './bodyMotion';
import { bodyMotionPlans } from './bodyMotionPlans';
import { replayBody } from './bodyReplay';

it('refuses every library motion for exactly co-located mass and payload explanations', async () => {
  const mj = await loadMujoco();
  const { request, terminal, bodyStart } = await colocatedBodyScenario(mj);

  expect(bodyStart).toBeGreaterThan(0);
  request.run = parkedBodyRun(request.model);

  const result = await analyzeBody(request, { mj });

  if (result.kind !== 'analyzed') throw new Error(result.reason);

  const selected = result.parameters.findIndex((parameter) => parameter.kind === 'payloadKg');
  const outcome = await recommendBodyMotion({ request, result, selected: [selected] }, { mj });

  expect(outcome.kind).toBe('no-improvement');
  expect(outcome.candidates.every((candidate) => !candidate.score.resolved)).toBe(true);

  for (const plan of bodyMotionPlans(request)) {
    const left = replayBody(
      { ...request, run: plan.run, mj },
      { massScales: { [terminal.name]: 1.5 }, payloadKg: {}, floorFrictionScale: 1 },
    );
    const right = replayBody(
      { ...request, run: plan.run, mj },
      { massScales: {}, payloadKg: { [terminal.name]: 0.1 }, floorFrictionScale: 1 },
    );
    const error = left.flatMap((row, index) => row.map((value, joint) => Math.abs(value - right[index][joint])));

    expect(Math.max(...error)).toBeLessThan(1e-10);
  }
});
