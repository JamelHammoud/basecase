import { reply } from '../../utils/workerRpc';
import { evaluateTraining } from './metrics';
import { preparationTransfer } from './prepareData';
import type { TrainingEvaluationInput } from './types';

export const evaluationJobs = {
  evaluate: async (input: TrainingEvaluationInput) =>
    reply({ report: await evaluateTraining(input), sets: input.sets }, preparationTransfer(input.sets)),
};
