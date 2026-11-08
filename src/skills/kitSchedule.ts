import type { SimModel } from '../sim/mjcfTypes';
import type { TrainedEntry } from './kitEnvironment';
import { footCount } from './kitModel';

export type DelaySteps = readonly [number, number];

export interface KitStage {
  minutes: number;
  delaySteps: DelaySteps;
}

export type KitTry = readonly KitStage[];

export const NEAR_DELAYS: DelaySteps = Object.freeze([0, 1] as const);
export const FAR_DELAYS: DelaySteps = Object.freeze([0, 2] as const);
export const WIDE_DELAYS: DelaySteps = Object.freeze([0, 3] as const);

const near = (minutes: number): KitTry => [{ minutes, delaySteps: NEAR_DELAYS }];

const curriculum = (...stages: Array<[number, DelaySteps]>): KitTry =>
  stages.map(([minutes, delaySteps]) => ({ minutes, delaySteps }));

const MANY_LEGS: Readonly<Record<TrainedEntry, readonly KitTry[]>> = Object.freeze({
  stand: [near(2), near(4)],
  'velocity-tracking': [near(12), near(12)],
  'get-up': [near(2), near(6), near(8)],
  'settle-to-neutral': [near(2), near(4)],
});

const TWO_LEGS: Readonly<Record<TrainedEntry, readonly KitTry[]>> = Object.freeze({
  ...MANY_LEGS,
  stand: [curriculum([3, NEAR_DELAYS], [5, WIDE_DELAYS]), curriculum([5, WIDE_DELAYS])],
  'velocity-tracking': [curriculum([20, NEAR_DELAYS], [12, FAR_DELAYS]), curriculum([8, FAR_DELAYS])],
});

export const kitSchedule = (model: SimModel, entry: TrainedEntry): readonly KitTry[] =>
  (footCount(model) >= 4 ? MANY_LEGS : TWO_LEGS)[entry];

export const scheduledMinutes = (tries: readonly KitTry[]) =>
  tries.flat().reduce((sum, stage) => sum + stage.minutes, 0);
