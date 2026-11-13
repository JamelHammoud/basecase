import type { MainModule } from '@mujoco/mujoco';
import type { ServoFit } from '../data/components';
import { predictLog, windowOf, type FitContext } from './fitServo';
import { presetServo } from './servoEstimate';
import type { ServoLog, ServoPart } from './types';
import { median } from './verdict';

export interface ReplayRequest {
  servo: ServoPart;
  logs: ServoLog[];
  fit?: ServoFit;
}

export interface ReplayTrace {
  positionRad: number[];
  medianErrorRad: number | null;
}

export const loggedTrace = (logs: ServoLog[]) => logs.flatMap((log) => log.positionRad);

export function medianError(predicted: ArrayLike<number>[], logs: ServoLog[]): number | null {
  const errors = logs.flatMap((log, k) => {
    const [from, to] = windowOf(log, 'all');

    return log.positionRad
      .slice(from, to)
      .map((p, i) => Math.abs(predicted[k][from + i] - p))
      .filter(Number.isFinite);
  });

  return errors.length ? median(errors) : null;
}

export function replayTrace(mj: MainModule, request: ReplayRequest): ReplayTrace {
  const ctx: FitContext = { mj, servo: request.servo, preset: presetServo(request.servo) };
  const fit = request.fit ?? null;
  const predicted = request.logs.map((log) => predictLog(ctx, fit, log));

  return {
    positionRad: predicted.flatMap((p) => [...p]),
    medianErrorRad: medianError(predicted, request.logs),
  };
}
