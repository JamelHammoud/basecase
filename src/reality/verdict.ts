import { sameServo, servoName } from './servoPart';
import type { ServoLog, ServoPart } from './types';
import { plural } from '../../electron/plural.mjs';

export const ENCODER_RAD = (2 * Math.PI) / 4096;

export const EVIDENCE = Object.freeze({ garbled: 0.5, explained: 0.8, minSamples: 50 });

export function explainedShare(errors: number[], spreads: number[]): number {
  const err = errors.reduce((s, e) => s + e * e, 0);
  const motion = spreads.reduce((s, e) => s + e * e, 0);

  return motion > 0 ? 1 - err / motion : 0;
}

const finite = (values: number[]) => values.every(Number.isFinite);

function logProblem(log: ServoLog, servo: ServoPart): string | null {
  const n = log.goalRad.length;

  if (!sameServo(log.servo, servo)) return `A log is from a ${servoName(log.servo)}, not a ${servoName(servo)}`;

  if (!Number.isFinite(log.dt) || log.dt <= 0) return 'A log has no sample period';

  if (n < EVIDENCE.minSamples) return `A log has only ${plural(n, 'sample')}`;

  if (log.positionRad.length !== n) return 'A log has more goals than positions';

  if (!finite(log.goalRad) || !finite(log.positionRad)) return 'A log has missing samples';

  return null;
}

export function preflight(logs: ServoLog[], servo: ServoPart): string | null {
  if (logs.length < 2) return 'Two logs or more are needed';

  return logs.map((log) => logProblem(log, servo)).find((p) => p) ?? null;
}

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function conditionsOf(logs: ServoLog[]): { volts: number; temperatureC: number } {
  const all = (key: 'volts' | 'temperatureC') => logs.flatMap((l) => l[key]).filter(Number.isFinite);
  const volts = all('volts');
  const temperature = all('temperatureC');

  return {
    volts: volts.length ? median(volts) : Number.NaN,
    temperatureC: temperature.length ? median(temperature) : Number.NaN,
  };
}
