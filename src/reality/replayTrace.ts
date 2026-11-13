import type { MainModule } from '@mujoco/mujoco';
import type { ServoFit } from '../data/components';
import { presetServo } from './bench';
import { predictLog, windowOf, type FitContext } from './fitServo';
import type { ServoFamily, ServoLog } from './types';
import { median } from './verdict';

export interface ReplayRequest {
  family: ServoFamily;
  logs: ServoLog[];
  fit?: ServoFit;
}

export interface ReplayTrace {
  positionRad: number[];
  medianErrorRad: number;
}

export const loggedTrace = (logs: ServoLog[]) => logs.flatMap((log) => log.positionRad);

export function medianError(predicted: ArrayLike<number>[], logs: ServoLog[]): number {
  const errors = logs.flatMap((log, k) => {
    const [from, to] = windowOf(log, 'all');

    return log.positionRad
      .slice(from, to)
      .map((p, i) => Math.abs(predicted[k][from + i] - p))
      .filter(Number.isFinite);
  });

  return errors.length ? median(errors) : Number.NaN;
}

export function replayTrace(mj: MainModule, request: ReplayRequest): ReplayTrace {
  const ctx: FitContext = { mj, family: request.family, preset: presetServo(request.family) };
  const fit = request.fit ?? ctx.preset.fit;
  const predicted = request.logs.map((log) => predictLog(ctx, fit, log));

  return {
    positionRad: predicted.flatMap((p) => [...p]),
    medianErrorRad: medianError(predicted, request.logs),
  };
}
