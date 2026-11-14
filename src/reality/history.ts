import { presetServo } from './servoEstimate';
import type { CalibrationVerdict, JointMount, ServoCalibration, ServoPart } from './types';

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
