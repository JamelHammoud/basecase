import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { bodyFixture, recordedBodyRun } from './bodyFit.fixtures';
import { fitBody } from './fitBody';
import { bodyMotionPlans } from './bodyMotionPlans';
import { bodyAnalysisScenario } from './bodyAnalysisMatrix.fixtures';
import { parkedBodyRun } from './bodyMotion.fixtures';
import { replayBody } from './bodyReplay';
import type { RobotRun } from '../robot/runBuffer';
import { analyzeBody } from './bodyAnalysis';
import { prepareBodySequence, advanceBodySequence, stopBodySequence } from './bodySequence';
import { validateBodySequence } from './bodySequenceValidation';
import { BODY_SEQUENCE_LIMITS } from './bodySequenceTypes';
import { recordBodyCalibration } from './history';
import type { BodyHistory } from './bodyTypes';

it('fits accumulated reset trajectories without fitting or selecting from held-out observations', async () => {
  const mj = await loadMujoco();
  const { request } = await bodyAnalysisScenario(mj, 'two-link masses');

  request.run = parkedBodyRun(request.model);

  const own = request.model.bodies.filter((body) => body.joint);
  const truth = { massScales: { [own[0].name]: 1.25 }, payloadKg: {}, floorFrictionScale: 1 };
  const observe = (run: RobotRun) => {
    const positions = replayBody({ ...request, run, mj }, truth);

    return { ...run, statuses: run.statuses.map((status, frame) => ({ ...status, positions: positions[frame] })) };
  };
  const validation = observe(recordedBodyRun(mj, request.model));
  const training = bodyMotionPlans(request)
    .filter((plan) => plan.shape !== 'hold')
    .slice(0, 2)
    .map((plan) => observe(plan.run));
  const frozen = structuredClone({ training, validation });
  const result = await fitBody({ ...request, run: training[0], training, validation, mj });

  expect(result.verdict, JSON.stringify(result)).toBe('measured');
  expect(result.evidence.gain).toBeGreaterThanOrEqual(0.25);
  expect({ training, validation }).toEqual(frozen);
  expect(
    (await fitBody({ ...request, run: training[0], training: [...training, validation], validation, mj })).verdict,
  ).toBe('cant-tell');
  expect(
    (
      await fitBody({
        ...request,
        run: training[0],
        training: [{ ...training[0], observations: 'servo-independent-1' }],
        validation,
        mj,
      })
    ).verdict,
  ).toBe('cant-tell');

  const { model, robot } = bodyFixture();
  const unchanged = recordedBodyRun(mj, model);

  expect((await fitBody({ model, robot, run: unchanged, training: [unchanged], mj })).verdict).toBe('cant-tell');
});

it('keeps validation separate from a stopped sequence and leaves an incumbent active after an inconclusive fit', async () => {
  const mj = await loadMujoco();
  const { request } = await bodyAnalysisScenario(mj, 'two-link masses');

  request.run = parkedBodyRun(request.model);

  const result = await analyzeBody(request, { mj });

  if (result.kind !== 'analyzed') throw new Error(result.reason);

  const declared = await prepareBodySequence({ request, result, selected: [0], limits: BODY_SEQUENCE_LIMITS }, { mj });
  const observed = await advanceBodySequence(request, declared, { mj });
  const stopped = stopBodySequence({ ...observed, reason: null });
  const fitted = await validateBodySequence({ request, sequence: stopped }, { mj });

  expect(fitted.reason).toBe('cancelled');
  expect(fitted.validation).toEqual(declared.validation);
  expect(fitted.rounds).toEqual(observed.rounds);
  expect(fitted.validationResult?.verdict).toBe('cant-tell');
  expect(fitted.spent.physicsSteps).toBeGreaterThan(stopped.spent.physicsSteps);

  const candidate = fitted.validationResult;

  if (!candidate) throw new Error('Validation did not run');

  const incumbent: BodyHistory = { versions: [{ ...candidate, version: 1, verdict: 'measured' }], active: 1 };
  const before = structuredClone(incumbent);

  expect(recordBodyCalibration(incumbent, candidate).active).toBe(1);
  expect(incumbent).toEqual(before);
  expect(await validateBodySequence({ request, sequence: fitted }, { mj })).toEqual(fitted);

  const exhausted = { ...stopped, spent: { ...stopped.spent, physicsSteps: stopped.limits.physicsSteps } };
  const refused = await validateBodySequence({ request, sequence: exhausted }, { mj });

  expect(refused.validationRefusal).toBe('budget');
  expect(refused.validationResult).toBeUndefined();
  expect(refused.reason).toBe('cancelled');
  expect(refused.spent).toEqual(exhausted.spent);
  expect(await validateBodySequence({ request, sequence: refused }, { mj })).toEqual(refused);
});
