import type { RobotMorphology } from '../sim/morphology';
import { tabTrainingReady } from '../forge/tabSupport';

export const trainingOffered = (morphology: RobotMorphology, canTrain: () => Promise<boolean> = tabTrainingReady) =>
  morphology === 'legged' ? canTrain() : Promise.resolve(false);
