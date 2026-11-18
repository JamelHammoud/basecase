import { requirementOutcomes } from './requirementRetention';
import { canonicalTest } from './metrics';
import { validateTrainingEvaluation } from './retentionValidation';
import type {
  TrainingComparisonAttempt,
  TrainingComparisonInput,
  TrainingEvaluation,
  TrainingRetentionReason,
} from './types';

export { validateTrainingEvaluation } from './retentionValidation';

function limitsSatisfied(report: TrainingEvaluation): boolean {
  const limits = report.task.limits;
  const { inference, perClass } = report.metrics;

  return (
    (limits.maxInferenceMs === undefined || inference.p95Ms <= limits.maxInferenceMs) &&
    (limits.maxModelBytes === undefined || inference.modelBytes <= limits.maxModelBytes) &&
    (limits.maxClassFailureRate === undefined ||
      perClass.every((category) => category.failureRate <= limits.maxClassFailureRate!))
  );
}

function retentionReason(candidate: TrainingEvaluation, incumbent?: TrainingEvaluation): TrainingRetentionReason {
  if (!candidate.realTest.length) return 'no-real-test';

  if (!incumbent) return 'no-incumbent';

  if (candidate.protocol !== incumbent.protocol || JSON.stringify(candidate.task) !== JSON.stringify(incumbent.task))
    return 'different-task';

  if (
    candidate.testHash !== incumbent.testHash ||
    canonicalTest(candidate.realTest) !== canonicalTest(incumbent.realTest)
  )
    return 'different-test';

  if (!limitsSatisfied(candidate)) return 'limits';

  if (requirementOutcomes(candidate, incumbent).some((row) => row.reason !== 'passed')) return 'requirements';

  if (
    candidate.metrics.primary === null ||
    incumbent.metrics.primary === null ||
    candidate.metrics.primary <= incumbent.metrics.primary
  )
    return 'no-improvement';

  return 'improved';
}

export function compareTraining(input: TrainingComparisonInput) {
  const { candidate, incumbent, history } = input;

  validateTrainingEvaluation(candidate);

  if (incumbent) validateTrainingEvaluation(incumbent);

  if (!input.id || !Number.isFinite(Date.parse(input.at)) || history.some((attempt) => attempt.id === input.id))
    throw new Error('Record each comparison attempt once with its time.');

  const reason = retentionReason(candidate, incumbent);
  const status = reason === 'improved' ? 'retained' : 'checkpoint';
  const attempt: TrainingComparisonAttempt = {
    id: input.id,
    at: input.at,
    candidateHash: candidate.modelHash,
    ...(incumbent ? { incumbentHash: incumbent.modelHash } : {}),
    testHash: candidate.testHash,
    metric: candidate.task.metric,
    candidateScore: candidate.metrics.primary,
    incumbentScore: incumbent?.metrics.primary ?? null,
    ...(candidate.task.requirements?.length ? { requirements: requirementOutcomes(candidate, incumbent) } : {}),
    previousAttempts: history.filter((previous) => previous.testHash === candidate.testHash).length,
    status,
    reason,
  };

  return { status: attempt.status, reason, attempt, attempts: [...history, attempt] };
}
