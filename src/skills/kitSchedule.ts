import type { SimModel } from '../sim/mjcfTypes';
import type { TrainedEntry } from './kitEnvironment';
import { footCount } from './kitModel';

export type DelaySteps = readonly [number, number];

export interface KitStage {
  minutes: number;
  delaySteps: DelaySteps;
  delayRamp?: number;
}

export interface KitTry {
  stages: readonly KitStage[];
  seeds: number;
}

export const NEAR_DELAYS: DelaySteps = Object.freeze([0, 1] as const);
export const FAR_DELAYS: DelaySteps = Object.freeze([0, 2] as const);
export const WIDE_DELAYS: DelaySteps = Object.freeze([0, 3] as const);

export const VELOCITY_SEEDS = 3;
export const VELOCITY_RAMP = 0.6;

const near = (minutes: number): KitTry => ({ stages: [{ minutes, delaySteps: NEAR_DELAYS }], seeds: 1 });

const curriculum = (...stages: Array<[number, DelaySteps]>): KitTry => ({
  stages: stages.map(([minutes, delaySteps]) => ({ minutes, delaySteps })),
  seeds: 1,
});

const velocity = (minutes: number, more: number): readonly KitTry[] => [
  { stages: [{ minutes, delaySteps: FAR_DELAYS, delayRamp: VELOCITY_RAMP }], seeds: VELOCITY_SEEDS },
  { stages: [{ minutes: more, delaySteps: FAR_DELAYS }], seeds: 1 },
];

const MANY_LEGS: Readonly<Record<TrainedEntry, readonly KitTry[]>> = Object.freeze({
  stand: [near(2), near(4)],
  'velocity-tracking': velocity(6, 4),
  'get-up': [near(2), near(6), near(8)],
  'settle-to-neutral': [near(2), near(4)],
});

const TWO_LEGS: Readonly<Record<TrainedEntry, readonly KitTry[]>> = Object.freeze({
  ...MANY_LEGS,
  stand: [curriculum([3, NEAR_DELAYS], [5, WIDE_DELAYS]), curriculum([5, WIDE_DELAYS])],
  'velocity-tracking': velocity(9, 6),
});

export const kitSchedule = (model: SimModel, entry: TrainedEntry): readonly KitTry[] =>
  (footCount(model) >= 4 ? MANY_LEGS : TWO_LEGS)[entry];

export const scheduledMinutes = (tries: readonly KitTry[]) =>
  tries.reduce((sum, t) => sum + t.seeds * t.stages.reduce((s, stage) => s + stage.minutes, 0), 0);
