import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it, vi } from 'vitest';
import { analyzeBody } from './bodyAnalysis';
import { changedFit } from './bodyAnalysisParameters';
import { bodyAnalysisScenario } from './bodyAnalysisMatrix.fixtures';
import { bodyMotionPlans } from './bodyMotionPlans';
import { bodyMotionResponses } from './bodyMotionResponses';
import { emptyBodyFit } from './bodyParameters';
import * as replay from './bodyReplay';
import { normalizedBodyResponse } from './bodySensitivity';
import { applyBodyFit } from './bodyModel';
import { sha256 } from '../cases/tries';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

it.each([1, 1.1])(
  'preserves independent probe responses and shares nominal replays with mass scale %s',
  async (scale) => {
    const { request } = await bodyAnalysisScenario(mj, 'stationary rover');

    request.nominal = { ...emptyBodyFit(), massScales: { [request.model.bodies[0].name]: scale } };

    const model = applyBodyFit(request.model, request.robot, request.nominal);

    request.source.modelFingerprint = model.robots[0].fingerprint;
    request.source.modelHash = await sha256(model.xml);

    const result = await analyzeBody(request, { mj });

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    const plans = bodyMotionPlans(request).slice(0, 1);
    const budget = { remainingSteps: 1_000_000 };
    const spy = vi.spyOn(replay, 'replayBodies');
    let actual: ReturnType<typeof bodyMotionResponses>;
    let calls: number;

    try {
      actual = bodyMotionResponses({ input: { request, result, selected: [0] }, plans, mj, budget });
      calls = spy.mock.calls.length;
    } finally {
      spy.mockRestore();
    }

    const independent = { remainingSteps: 1_000_000 };
    const normalize = (positions: number[][]) =>
      Float64Array.from(
        positions.flatMap((row) =>
          row.map(
            (value, joint) => value / (request.units[joint] === 'rad' ? result.method.noiseRad : result.method.noiseM),
          ),
        ),
      );
    const expected = result.parameters.map((parameter) => {
      const probe = (value: number) =>
        replay.replayBodies(
          {
            ...request,
            model: { ...request.model, scans: undefined },
            mj,
            runs: plans.map((plan) => plan.run),
            budget: independent,
          },
          changedFit({ request, parameter, value }),
        )[0];
      const low = normalize(probe(parameter.probe[0]));
      const high = normalize(probe(parameter.probe[1]));

      return normalizedBodyResponse({
        low,
        high,
        span: parameter.probe[1] - parameter.probe[0],
        scale: parameter.scale,
      });
    });

    expect(actual.columns).toEqual([expected]);
    expect(plans).toHaveLength(1);
    expect(calls).toBeLessThan(result.parameters.length * 2);
    expect(budget.remainingSteps).toBeGreaterThan(independent.remainingSteps);
    expect(() =>
      bodyMotionResponses({ input: { request, result, selected: [0] }, plans, mj, budget: { remainingSteps: 1 } }),
    ).toThrow(replay.BodyReplayStopped);
  },
);
