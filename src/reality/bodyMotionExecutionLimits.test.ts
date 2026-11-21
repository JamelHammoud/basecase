import { expect, it } from 'vitest';
import { bodyFixture } from './bodyFit.fixtures';
import { parkedBodyRun } from './bodyMotion.fixtures';
import { bodyMotionPlanProblem, bodyMotionPlans } from './bodyMotionPlans';
import { trajectoryLimits } from '../robot/benchTrajectory';
import type { BodyAnalysisRequest } from './bodyAnalysisTypes';

it('retains old simulated declarations and generates an explicit Test-compatible plan without translating its start', () => {
  const { model, robot } = bodyFixture();
  const request: BodyAnalysisRequest = {
    model,
    robot,
    run: parkedBodyRun(model),
    units: model.joints.map(() => 'rad'),
    source: {
      recording: 'source',
      scene: 'scene',
      unit: 'robot',
      modelHash: 'a'.repeat(64),
      modelFingerprint: model.robots[0].fingerprint,
      calibrationFingerprint: 'preset',
    },
  };
  const original = bodyMotionPlans(request)[0];
  const before = structuredClone(original);
  const compatible = bodyMotionPlans(request, 0.5)[0];
  const input = {
    unit: 'robot',
    joints: request.run.joints,
    recording: { recommendation: 'a'.repeat(64), sourceKey: 'b'.repeat(64) },
  };

  expect(bodyMotionPlanProblem(request, original)).toBeNull();
  expect(bodyMotionPlanProblem(request, original, 0.5)).toBe('unsupported');
  expect(trajectoryLimits({ ...input, points: original.run.intents })).toBe(false);
  expect(bodyMotionPlanProblem(request, compatible, 0.5)).toBeNull();
  expect(trajectoryLimits({ ...input, points: compatible.run.intents })).toBe(true);
  expect(compatible.run.intents[0]).toEqual(original.run.intents[0]);
  expect(compatible.workBoundJ).toBeLessThan(original.workBoundJ);
  expect(original).toEqual(before);
});
