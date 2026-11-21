import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { replayBody } from './bodyReplay';
import { analyzeBody } from './bodyAnalysis';
import { bodyAnalysisScenario, BODY_ANALYSIS_SCENARIOS } from './bodyAnalysisMatrix.fixtures';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('generated recorded body distinguishability scenarios', () => {
  it.each(BODY_ANALYSIS_SCENARIOS)('analyzes %s with production MuJoCo replay', async (name) => {
    const fixture = await bodyAnalysisScenario(mj, name);
    const result = await analyzeBody(fixture.request, { mj });

    expect(result.kind, JSON.stringify(result)).toBe('analyzed');

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    expect(result.residual.modelExplainsObservations).toBe(true);
    expect(result.replays).toBe(1 + 2 * result.parameters.length);
    expect(result.parameters.every((parameter) => Number.isFinite(parameter.response))).toBe(true);

    for (const expected of fixture.expected) {
      const found = result.parameters.find(
        (parameter) => parameter.kind === expected.kind && parameter.body === expected.body,
      );

      expect(found?.distinguishability, JSON.stringify(result.parameters)).toBe(expected.status);
    }

    if (name === 'coupled wrist') {
      const direction = result.directions.find(
        (entry) => !entry.distinguishable && entry.weights.filter((weight) => Math.abs(weight) >= 0.1).length >= 2,
      );

      expect(direction).toBeDefined();
    }

    if (fixture.contactTransitions !== undefined) expect(fixture.contactTransitions).toBeGreaterThan(0);
  });
});

describe('independent coupled-direction replay', () => {
  it('verifies the weak coupled direction by applying its combined physical perturbation', async () => {
    const { request } = await bodyAnalysisScenario(mj, 'coupled wrist');
    const result = await analyzeBody(request, { mj });

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    const payloadIndex = result.parameters.findIndex((parameter) => parameter.kind === 'payloadKg');
    const direction = result.directions.find(
      (entry) => !entry.distinguishable && Math.abs(entry.weights[payloadIndex]) > 0.1,
    )!;
    const sign = direction.weights[payloadIndex] < 0 ? -1 : 1;
    const epsilon = 0.001;
    const fit = { massScales: {}, payloadKg: {}, floorFrictionScale: 1 };

    result.parameters.forEach((parameter, index) => {
      const value = parameter.nominal + sign * epsilon * parameter.scale * direction.weights[index];

      expect(value).toBeGreaterThanOrEqual(parameter.bounds[0]);
      expect(value).toBeLessThanOrEqual(parameter.bounds[1]);

      if (parameter.kind === 'floorFrictionScale') fit.floorFrictionScale = value;
      else Object.assign(fit[parameter.kind], { [parameter.body]: value });
    });

    const prediction = replayBody({ ...request, mj }, fit);
    const differences = prediction.flatMap((row, frame) =>
      row.map((value, index) => (value - request.run.statuses[frame].positions[index]!) / result.method.noiseRad),
    );
    const response =
      Math.sqrt(differences.reduce((sum, value) => sum + value * value, 0) / differences.length) / epsilon;

    expect(response).toBeLessThan(result.method.absoluteResponse);
  });
});
