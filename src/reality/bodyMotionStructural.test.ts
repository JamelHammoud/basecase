import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { bodyAnalysisScenario } from './bodyAnalysisMatrix.fixtures';
import { parkedBodyRun } from './bodyMotion.fixtures';
import { analyzeBody } from './bodyAnalysis';
import { recommendBodyMotion } from './bodyMotion';
import { bodyMotionPlans } from './bodyMotionPlans';
import { replayBody } from './bodyReplay';
import { sha256 } from '../cases/tries';

it('refuses every library motion for exactly co-located mass and payload explanations', async () => {
  const mj = await loadMujoco();
  const { request } = await bodyAnalysisScenario(mj, 'coupled wrist');
  const terminal = request.model.bodies.find((body) => body.joint === 'wrist')!;
  const at = request.model.bodyPayloads![terminal.name];
  const bodyStart = request.model.xml.indexOf(`<body name="${terminal.name}"`);
  const geomStart = request.model.xml.indexOf('<geom ', bodyStart);
  const geomEnd = request.model.xml.indexOf('/>', geomStart) + 2;

  expect(bodyStart).toBeGreaterThan(0);
  request.model.xml =
    request.model.xml.slice(0, geomStart) +
    `<geom name="colocated" type="sphere" size="0.001" pos="${at.join(' ')}" mass="0.2" contype="0" conaffinity="0"/>` +
    request.model.xml.slice(geomEnd);
  request.source.modelHash = await sha256(request.model.xml);
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
