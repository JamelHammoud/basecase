import { reply } from '../../utils/workerRpc';
import { prepareTrainingData, preparationTransfer, type PreparationInput } from './prepareData';

export const preparationJobs = {
  prepare: async (input: PreparationInput) => {
    const result = await prepareTrainingData(input);

    return reply(result, preparationTransfer(result.sets));
  },
};
