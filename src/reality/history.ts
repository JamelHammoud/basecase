import { presetServo } from './servoEstimate';
import type { CalibrationVerdict, JointMount, ServoCalibration, ServoPart } from './types';
import type { BodyCalibration, BodyHistory } from './bodyTypes';

export type { BodyHistory } from './bodyTypes';

export function activeBodyCalibration(history: BodyHistory | undefined): BodyCalibration | null {
  return history?.versions.find((c) => c.version === history.active && c.verdict === 'measured') ?? null;
}

export function recordBodyCalibration(
  history: BodyHistory,
  calibration: BodyCalibration,
  now = new Date(),
): BodyHistory {
  const version = (history.versions.at(-1)?.version ?? 0) + 1;

  return {
    versions: [...history.versions, { ...calibration, version, recordedAt: now.toISOString() }],
    active: calibration.verdict === 'measured' ? version : history.active,
  };
}

function previousHistory<
  History extends { versions: Array<{ version: number; verdict: string }>; active: number | null },
>(history: History): History {
  const earlier = history.versions.filter(
    (c) => c.verdict === 'measured' && history.active !== null && c.version < history.active,
  );

  return { ...history, active: earlier.at(-1)?.version ?? null };
}

export const rollBackBody = previousHistory<BodyHistory>;

export interface CalibrationHistory {
  versions: ServoCalibration[];
  active: number | null;
}

export const EMPTY_HISTORY: CalibrationHistory = Object.freeze({ versions: [], active: null });

export function recordCalibration(history: CalibrationHistory, calibration: ServoCalibration): CalibrationHistory {
  const version = (history.versions.at(-1)?.version ?? 0) + 1;
  const mount = calibration.mount ?? activeCalibration(history)?.mount;
  const recorded = { ...calibration, version, ...(mount ? { mount } : {}) };

  return {
    versions: [...history.versions, recorded],
    active: calibration.verdict === 'measured' ? version : history.active,
  };
}

export function activeCalibration(history: CalibrationHistory): ServoCalibration | null {
  return history.versions.find((c) => c.version === history.active) ?? null;
}

export function rollBack(history: CalibrationHistory): CalibrationHistory {
  return previousHistory(history);
}

export function activeCalibrations(histories: Record<string, CalibrationHistory> | undefined) {
  const out: Record<string, ServoCalibration> = {};

  for (const [jointId, history] of Object.entries(histories ?? {})) {
    const active = activeCalibration(history);

    if (active) out[jointId] = active;
  }

  return out;
}

export function simCalibrations(histories: Record<string, CalibrationHistory> | undefined) {
  const out: Record<string, ServoCalibration> = {};

  for (const [jointId, history] of Object.entries(histories ?? {})) {
    const latest = history.versions.at(-1);
    const chosen = activeCalibration(history) ?? (latest?.verdict === 'consistent' ? latest : null);

    if (chosen) out[jointId] = chosen;
  }

  return out;
}

export const activeMount = (history: CalibrationHistory | undefined): JointMount | null =>
  (history && activeCalibration(history)?.mount) ?? null;

export function activeMounts(histories: Record<string, CalibrationHistory> | undefined) {
  const out: Record<string, JointMount> = {};

  for (const [jointId, history] of Object.entries(histories ?? {})) {
    const mount = activeMount(history);

    if (mount) out[jointId] = mount;
  }

  return out;
}

function presetRecord(servo: ServoPart): ServoCalibration {
  const preset = presetServo(servo);

  return {
    verdict: 'consistent',
    servo,
    version: 0,
    rung: 'preset',
    fit: preset.fit,
    volts: preset.volts,
    scales: {},
    conditions: { volts: preset.volts, temperatureC: Number.NaN },
    evidence: {
      logs: 0,
      presetErrorRad: Number.NaN,
      fittedErrorRad: Number.NaN,
      gain: 0,
      explained: Number.NaN,
      reason: '',
    },
  };
}

export interface FoundMount {
  servo: ServoPart;
  verdict: CalibrationVerdict;
  mount: JointMount;
  reason: string;
}

export function recordMount(history: CalibrationHistory, found: FoundMount): CalibrationHistory {
  const base = activeCalibration(history) ?? presetRecord(found.servo);
  const mount = found.verdict === 'measured' ? found.mount : base.mount;

  return recordCalibration(history, {
    ...base,
    verdict: found.verdict,
    evidence: { ...base.evidence, reason: found.reason },
    ...(mount ? { mount } : {}),
  });
}
