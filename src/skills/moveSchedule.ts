import type { SimModel } from '../sim/mjcfTypes';
import { footCount } from './kitModel';
import { FAR_DELAYS, VELOCITY_RAMP, type KitTry } from './kitSchedule';

const MANY_LEGS: readonly KitTry[] = Object.freeze([
  { stages: [{ minutes: 6, delaySteps: FAR_DELAYS, delayRamp: VELOCITY_RAMP }], seeds: 1 },
  { stages: [{ minutes: 4, delaySteps: FAR_DELAYS }], seeds: 1 },
]);

const TWO_LEGS: readonly KitTry[] = Object.freeze([
  { stages: [{ minutes: 9, delaySteps: FAR_DELAYS, delayRamp: VELOCITY_RAMP }], seeds: 1 },
  { stages: [{ minutes: 6, delaySteps: FAR_DELAYS }], seeds: 1 },
]);

export const moveSchedule = (model: SimModel): readonly KitTry[] => (footCount(model) >= 4 ? MANY_LEGS : TWO_LEGS);
