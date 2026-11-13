import type { MainModule } from '@mujoco/mujoco';
import type { ServoFit } from '../data/components';
import { presetServo } from './bench';
import { predictLog, windowOf } from './fitServo';
import type { ReplayLog, ServoFamily } from './types';
import { median } from './verdict';

const STORED_DIGITS = 1e6;

const rounded = (values: number[]) => values.map((v) => Math.round(v * STORED_DIGITS) / STORED_DIGITS);

export const storedLogs = (logs: ReplayLog[]): ReplayLog[] =>
  logs.map(({ family, dt, goalRad, positionRad, payload }) => ({
    family,
    dt,
    goalRad: rounded(goalRad),
    positionRad: rounded(positionRad),
    payload: { ...payload },
  }));

export interface ReplayRequest {
  family: ServoFamily;
  logs: ReplayLog[];
  fit?: ServoFit;
}

export interface VersionReplay {
  positionRad: number[];
  medianErrorRad: number;
}

export function replayVersion(mj: MainModule, request: ReplayRequest): VersionReplay {
  const preset = presetServo(request.family);
  const ctx = { mj, family: request.family, preset };
  const fit = request.fit ?? preset.fit;
  const positionRad: number[] = [];
  const errors: number[] = [];

  for (const log of request.logs) {
    const predicted = predictLog(ctx, fit, log);
    const [from, to] = windowOf(log, 'all');

    positionRad.push(...predicted);

    for (let i = from; i < to; i++) errors.push(Math.abs(predicted[i] - log.positionRad[i]));
  }

  const finite = errors.filter(Number.isFinite);

  return { positionRad, medianErrorRad: finite.length ? median(finite) : Number.NaN };
}

export function loggedTrace(logs: ReplayLog[]): { seconds: number[]; positionRad: number[] } {
  const seconds: number[] = [];
  const positionRad: number[] = [];
  let start = 0;

  for (const log of logs) {
    log.positionRad.forEach((p, i) => {
      seconds.push(start + i * log.dt);
      positionRad.push(p);
    });
    start += log.positionRad.length * log.dt;
  }

  return { seconds, positionRad };
}

export function errorDegrees(rad: number): string {
  const deg = (rad * 180) / Math.PI;

  return `${deg >= 10 ? deg.toFixed(0) : deg.toPrecision(2)}°`;
}
