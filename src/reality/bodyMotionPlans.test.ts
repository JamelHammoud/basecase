import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyAnalysisScenario } from './bodyAnalysisMatrix.fixtures';
import { bodyMotionPlans, bodyMotionPlanProblem } from './bodyMotionPlans';
import { BODY_MOTION_LIMITS } from './bodyMotionTypes';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('bounded deterministic motion library', () => {
  it('starts every plan at the retained measured pose and keeps the input immutable', async () => {
    const { request } = await bodyAnalysisScenario(mj, 'two-link masses');
    const before = structuredClone(request);
    const plans = bodyMotionPlans(request);

    expect(plans.length).toBeGreaterThan(0);
    expect(plans.length).toBeLessThanOrEqual(BODY_MOTION_LIMITS.candidates);
    expect(plans).toEqual(bodyMotionPlans(request));

    for (const plan of plans) {
      expect(plan.run.statuses[0].positions).toEqual(request.run.statuses[0].positions);
      expect(plan.run.intents[0].joints).toEqual(request.run.statuses[0].positions);
      expect(bodyMotionPlanProblem(request, plan)).toBeNull();
    }

    expect(request).toEqual(before);
    request.run.statuses[0].positions[0] = 0.2;
    expect(bodyMotionPlans(request)[0].run.intents[0].joints[0]).toBeCloseTo(0.2);
  });

  it('clips motion amplitudes at joint bounds and refuses starting states outside them', async () => {
    const { request } = await bodyAnalysisScenario(mj, 'single-link arm');

    request.model.joints[0].range = [-1, 1];

    expect(bodyMotionPlans(request).every((plan) => !bodyMotionPlanProblem(request, plan))).toBe(true);
    request.run.statuses[0].positions[0] = 1;
    expect(bodyMotionPlans(request)).toEqual([]);
  });

  it('refuses unsupported actuators, nonfinite data and excessive speed or work', async () => {
    const { request } = await bodyAnalysisScenario(mj, 'single-link arm');
    const plan = bodyMotionPlans(request)[0];
    const malformed = structuredClone(plan);

    malformed.run.intents[1].joints[0] = 100;
    expect(bodyMotionPlanProblem(request, malformed)).not.toBeNull();
    malformed.run.intents[1].joints[0] = NaN;
    expect(bodyMotionPlanProblem(request, malformed)).not.toBeNull();
    request.model.joints[0].drive = 'velocity';
    expect(bodyMotionPlans(request)).toEqual([]);
    request.model.joints[0].drive = 'position';
    request.model.joints[0].effort = Infinity;
    expect(bodyMotionPlans(request)).toEqual([]);
  });
});
