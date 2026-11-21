import type { MainModule } from '@mujoco/mujoco';
import { fitBody } from './fitBody';
import type { BodyAnalysisRequest } from './bodyAnalysisTypes';
import type { BodySequence } from './bodySequenceTypes';
import { BodyReplayStopped } from './bodyReplay';
import { hashOf } from '../skills/hash';
import { loadedMujoco } from './calibrate';

export async function validateBodySequence(
  input: { request: BodyAnalysisRequest; sequence: BodySequence },
  options: { mj?: MainModule } = {},
): Promise<BodySequence> {
  const { request, sequence } = input;

  if (
    !sequence.reason ||
    !sequence.rounds.length ||
    sequence.source !== hashOf(request) ||
    sequence.validationResult ||
    sequence.validationRefusal
  )
    return sequence;

  if (!['resolved', 'no-improvement', 'rounds', 'duration', 'cancelled'].includes(sequence.reason)) return sequence;

  const mj = options.mj ?? (await loadedMujoco());

  if (sequence.mujocoVersion !== mj.mj_version()) return { ...sequence, validationRefusal: 'provenance' };

  const budget = { remainingSteps: sequence.limits.physicsSteps - sequence.spent.physicsSteps };
  const before = budget.remainingSteps;

  try {
    const validationResult = await fitBody({
      ...request,
      mj,
      training: [request.run, ...sequence.rounds.map((round) => round.run)],
      validation: sequence.validation,
      budget,
    });

    return {
      ...sequence,
      validationResult,
      spent: { ...sequence.spent, physicsSteps: sequence.spent.physicsSteps + before - budget.remainingSteps },
    };
  } catch (error) {
    if (!(error instanceof BodyReplayStopped)) throw error;

    return {
      ...sequence,
      validationRefusal: error.reason,
      spent: { ...sequence.spent, physicsSteps: sequence.spent.physicsSteps + before - budget.remainingSteps },
    };
  }
}
