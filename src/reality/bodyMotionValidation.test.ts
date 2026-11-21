import { mkdirSync, writeFileSync } from 'node:fs';
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { bodyAnalysisScenario } from './bodyAnalysisMatrix.fixtures';
import { analyzeBody } from './bodyAnalysis';
import { recommendBodyMotion } from './bodyMotion';
import { bodyMotionPlans } from './bodyMotionPlans';
import { parkedBodyRun } from './bodyMotion.fixtures';
import { recordedBodyRun } from './bodyFit.fixtures';
import { replayBody } from './bodyReplay';
import { emptyBodyFit } from './bodyParameters';
import type { BodyFit } from './bodyTypes';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function rms(predicted: number[][], observed: number[][]) {
  const differences = predicted.flatMap((row, frame) => row.map((value, joint) => value - observed[frame][joint]));

  return Math.sqrt(differences.reduce((sum, value) => sum + value * value, 0) / differences.length);
}

it.each([
  [1.1, 0, 0],
  [1.25, 0.05, 1],
  [1.4, 0.1, 1],
])(
  'checks planted forearm scale %s and payload %s on a separate trajectory against equal-duration motions',
  async (scale, payload, originalPick) => {
    const { request } = await bodyAnalysisScenario(mj, 'two-link masses');

    request.run = parkedBodyRun(request.model);

    const result = await analyzeBody(request, { mj });

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    const outcome = await recommendBodyMotion({ request, result, selected: [0] }, { mj });

    if (outcome.kind !== 'recommended') throw new Error(outcome.kind);

    const truth: BodyFit = {
      massScales: { [result.parameters[0].body]: scale },
      payloadKg: { [result.parameters.find((parameter) => parameter.kind === 'payloadKg')!.body]: payload },
      floorFrictionScale: 1,
    };
    const alternatives = [emptyBodyFit(), truth];
    const validation = recordedBodyRun(mj, request.model);
    const validate = (fit: BodyFit) => replayBody({ ...request, mj, run: validation }, fit);
    const heldOut = validate(truth);
    const fixed = bodyMotionPlans(request)[0];
    const motions = [request.run, fixed.run, outcome.plan.run];
    const errors = motions.map((run) => {
      const observed = replayBody({ ...request, mj, run }, truth);
      const predictions = alternatives.map((fit) => replayBody({ ...request, mj, run }, fit));
      const residuals = predictions.map((prediction) => rms(prediction, observed));
      const picked = residuals[1] + result.method.noiseRad < residuals[0] ? 1 : 0;

      return { residuals, picked, validationErrorRad: rms(validate(alternatives[picked]), heldOut) };
    });

    mkdirSync('scratch', { recursive: true });
    writeFileSync(
      `scratch/body-motion-validation-${scale}.json`,
      JSON.stringify(
        {
          scale,
          payload,
          selected: outcome.plan.id,
          fixed: fixed.id,
          errors,
          score: outcome.score,
          seconds: outcome.plan.seconds,
          limits: { workBoundJ: outcome.plan.workBoundJ, fixedWorkBoundJ: fixed.workBoundJ },
        },
        null,
        2,
      ),
    );
    expect(motions.map((run) => run.statuses.at(-1)!.at - run.statuses[0].at)).toEqual([2000, 2000, 2000]);
    expect(errors[0].picked).toBe(originalPick);
    expect(errors[2].picked).toBe(1);
    expect(errors[2].validationErrorRad).toBe(0);
    expect(errors[0].validationErrorRad > 0).toBe(originalPick === 0);
    expect(errors[2].validationErrorRad).toBeLessThanOrEqual(errors[0].validationErrorRad);
    expect(errors[2].validationErrorRad).toBeLessThanOrEqual(errors[1].validationErrorRad);
  },
);
