import type { ServoCalibration } from './types';

export interface CalibrationHistory {
  versions: ServoCalibration[];
  active: number | null;
}

export const EMPTY_HISTORY: CalibrationHistory = Object.freeze({ versions: [], active: null });

export function recordCalibration(history: CalibrationHistory, calibration: ServoCalibration): CalibrationHistory {
  const version = (history.versions.at(-1)?.version ?? 0) + 1;
  const recorded = { ...calibration, version };

  return {
    versions: [...history.versions, recorded],
    active: calibration.verdict === 'measured' ? version : history.active,
  };
}

export function activeCalibration(history: CalibrationHistory): ServoCalibration | null {
  return history.versions.find((c) => c.version === history.active) ?? null;
}

export function rollBack(history: CalibrationHistory): CalibrationHistory {
  const earlier = history.versions.filter(
    (c) => c.verdict === 'measured' && history.active !== null && c.version < history.active,
  );

  return { ...history, active: earlier.at(-1)?.version ?? null };
}

export function activeCalibrations(histories: Record<string, CalibrationHistory> | undefined) {
  const out: Record<string, ServoCalibration> = {};

  for (const [jointId, history] of Object.entries(histories ?? {})) {
    const active = activeCalibration(history);

    if (active) out[jointId] = active;
  }

  return out;
}
