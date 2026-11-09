import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../../src/sim/mjcfTypes';
import { seededRng, type Rng } from '../zoo/rng';
import { recordUnit, type Player, type UnitLogs } from './excite';
import type { Payload, ServoLog } from './plant';
import { predict, presetModel, withFit } from './sim';
import { bootstrapMedianLower, median, rms } from './stats';
import { drawUnit, inClass, nominalUnit, oracleFit, presetOf, type Family, type TwinUnit } from './units';

export const TWIN_BARS = Object.freeze({
  units: 24,
  minUnits: 20,
  reduction: 0.25,
  implausibleReduction: 0.9,
  floorRad: (2 * Math.PI) / 4096,
});

export interface HiddenUnit {
  unit: TwinUnit;
  logs: UnitLogs;
}

export function hiddenUnits(seed: string, family: Family, make = drawUnit): HiddenUnit[] {
  return Array.from({ length: TWIN_BARS.units }, (_, i) => {
    const rng = seededRng(seed, family, String(i));
    const unit = make(rng, family);

    return { unit, logs: recordUnit(unit, rng) };
  });
}

export const fittedModel = (unit: TwinUnit): ModelFor => {
  const { volts } = presetOf(unit.family);

  return (payload) => withFit(presetModel(unit.family, payload), { fit: oracleFit(unit), volts, payload });
};

function simPlayer(mj: MainModule, unit: TwinUnit): Player {
  const modelFor = fittedModel(unit);

  return (goalRad, payload) => {
    const log: ServoLog = {
      family: unit.family,
      dt: 0.01,
      goalRad,
      positionRad: [goalRad[0]],
      loadRatio: goalRad.map(() => 0),
      volts: goalRad.map(() => unit.volts),
      temperatureC: goalRad.map(() => unit.thermal.ambientC),
      payload,
    };

    return { ...log, positionRad: predict(mj, modelFor(payload), log) };
  };
}

export function inClassUnits(mj: MainModule, seed: string, family: Family): HiddenUnit[] {
  return Array.from({ length: TWIN_BARS.units }, (_, i) => {
    const rng = seededRng(seed, family, 'in-class', String(i));
    const unit = inClass(drawUnit(rng, family));

    return { unit, logs: recordUnit(unit, rng, simPlayer(mj, unit)) };
  });
}

export function presetUnits(mj: MainModule, seed: string, family: Family, count = 4): HiddenUnit[] {
  return Array.from({ length: count }, (_, i) => {
    const rng = seededRng(seed, family, 'preset', String(i));
    const unit = nominalUnit(family);

    return { unit, logs: recordUnit(unit, rng, simPlayer(mj, unit)) };
  });
}

export type ModelFor = (payload: Payload) => SimModel;

export interface UnitScore {
  before: number;
  after: number;
  reduction: number;
}

const heldOut = (logs: UnitLogs): ServoLog[] => [logs.replay, logs.otherLoad];

function trackingError(mj: MainModule, logs: ServoLog[], modelFor: ModelFor): number {
  const errors = logs.map((log) => rms(predict(mj, modelFor(log.payload), log), log.positionRad));

  return Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length);
}

export function scoreUnit(mj: MainModule, family: Family, logs: UnitLogs, after: ModelFor): UnitScore {
  const before = trackingError(mj, heldOut(logs), (payload) => presetModel(family, payload));
  const tuned = trackingError(mj, heldOut(logs), after);

  return { before, after: tuned, reduction: 1 - tuned / before };
}

export interface FamilyVerdict {
  problems: string[];
  alarm: string | null;
  metrics: Record<string, number>;
}

export function familyVerdict(scores: UnitScore[], rng: Rng = seededRng('bootstrap')): FamilyVerdict {
  const reductions = scores.map((s) => s.reduction);
  const medianReduction = median(reductions);
  const before = median(scores.map((s) => s.before));
  const after = median(scores.map((s) => s.after));
  const lower = scores.length ? bootstrapMedianLower(reductions, rng) : Number.NaN;
  const problems: string[] = [];
  const implausible = medianReduction > TWIN_BARS.implausibleReduction || after < TWIN_BARS.floorRad;
  const alarm = implausible
    ? `Implausibly large gain (median ${(medianReduction * 100).toFixed(0)}% better): the twin may share the training model class`
    : null;

  if (scores.length < TWIN_BARS.minUnits) problems.push(`Only ${scores.length} hidden units`);

  if (Number.isNaN(medianReduction) || medianReduction < TWIN_BARS.reduction)
    problems.push(`Median tracking error down ${(medianReduction * 100).toFixed(1)}%, needs 25%`);

  if (Number.isNaN(after) || after > (1 - TWIN_BARS.reduction) * before)
    problems.push(`Median error ${after.toFixed(4)} rad against ${before.toFixed(4)} rad before`);

  if (Number.isNaN(lower) || lower <= 0)
    problems.push(`Bootstrap 95% CI of the median reduction reaches ${(lower * 100).toFixed(1)}%`);

  if (alarm) problems.push(alarm);

  return { problems, alarm, metrics: { units: scores.length, medianReduction, lower, before, after } };
}
