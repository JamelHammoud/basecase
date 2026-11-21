import type { BodyAnalysisRequest } from './bodyAnalysisTypes';
import { bodyMotionPlans } from './bodyMotionPlans';
import { bodyTrajectoryKey } from './bodyRun';

export function bodySequenceValidationPlan(request: BodyAnalysisRequest) {
  const supported = bodyMotionPlans(request);
  const excluded = new Set([bodyTrajectoryKey(request.run), ...supported.map((plan) => bodyTrajectoryKey(plan.run))]);
  const plans = [
    ...supported.filter((plan) => plan.shape === 'oscillation'),
    ...supported.filter((plan) => plan.shape !== 'oscillation'),
  ];

  for (const plan of plans) {
    for (const scale of [0.5, 1 / 3, 0.25]) {
      const run = {
        ...plan.run,
        intents: plan.run.intents.map((intent) => ({
          ...intent,
          joints: intent.joints.map(
            (value, index) =>
              request.run.statuses[0].positions[index]! + scale * (value - request.run.statuses[0].positions[index]!),
          ),
        })),
      };

      if (!excluded.has(bodyTrajectoryKey(run))) return { ...plan, run, workBoundJ: plan.workBoundJ * scale };
    }
  }

  return null;
}
