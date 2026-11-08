import type { SimModel } from '../sim/mjcfTypes';
import type { TrainedEntry } from './kitEnvironment';
import { footCount } from './kitModel';

const MANY_LEGS: Readonly<Record<TrainedEntry, readonly number[]>> = Object.freeze({
  stand: [2, 4],
  'velocity-tracking': [13, 12],
  'get-up': [2, 6, 8],
  'settle-to-neutral': [2, 4],
});

const TWO_LEGS: Readonly<Record<TrainedEntry, readonly number[]>> = Object.freeze({
  ...MANY_LEGS,
  stand: [3, 8],
  'velocity-tracking': [22, 18],
});

export const kitSchedule = (model: SimModel, entry: TrainedEntry): readonly number[] =>
  (footCount(model) >= 4 ? MANY_LEGS : TWO_LEGS)[entry];
