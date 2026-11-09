import { fitScales, segmentErrors, type FitContext, type RungFit } from './fitServo';
import type { ServoParam, ServoScales } from './servoParams';
import type { RungName, ServoLog } from './types';

export const RUNGS: ReadonlyArray<{ name: Exclude<RungName, 'preset'>; params: readonly ServoParam[] }> = [
  { name: 'response', params: ['gain', 'delay', 'damping', 'armature'] },
  { name: 'friction-force', params: ['gain', 'delay', 'damping', 'armature', 'friction', 'loadFriction', 'force'] },
];

export const LADDER = Object.freeze({ passGain: 0.25, minGain: 0.05 });

export interface RungResult extends RungFit {
  rung: RungName;
  checkErrors: number[];
  gain: number;
  everyLogBetter: boolean;
}

export const combinedError = (errors: number[]) =>
  Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / Math.max(errors.length, 1));

export function rungResult(rung: RungName, fitted: RungFit, checkErrors: number[], presetErrors: number[]): RungResult {
  return {
    ...fitted,
    rung,
    checkErrors,
    gain: 1 - combinedError(checkErrors) / combinedError(presetErrors),
    everyLogBetter: checkErrors.every((e, i) => e <= presetErrors[i]),
  };
}

export const passes = (r: RungResult) => r.everyLogBetter && r.gain >= LADDER.passGain;

export const helps = (r: RungResult) => r.gain >= LADDER.minGain;

export function climbLadder(ctx: FitContext, logs: ServoLog[], presetErrors: number[]): RungResult | null {
  const tried: RungResult[] = [];
  let start: ServoScales = {};

  for (const { name, params } of RUNGS) {
    const fitted = fitScales(ctx, { names: params, logs, segment: 'fit', start });
    const result = rungResult(name, fitted, segmentErrors(ctx, fitted.fit, logs, 'check'), presetErrors);

    if (passes(result)) return result;

    tried.push(result);
    start = fitted.scales;
  }

  const useful = tried.filter(helps);

  return useful.length ? useful.reduce((a, b) => (b.gain > a.gain ? b : a)) : null;
}
