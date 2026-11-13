import type { ServoFit } from '../data/components';

export interface ServoPart {
  componentId: string;
  variant?: string;
}

export type FamilyName = 'sts3215' | 'xl330';

export interface BenchPayload {
  massKg: number;
  armM: number;
}

export interface ServoLog {
  servo: ServoPart;
  dt: number;
  goalRad: number[];
  positionRad: number[];
  loadRatio: number[];
  volts: number[];
  temperatureC: number[];
  payload: BenchPayload;
}

export type CalibrationVerdict = 'measured' | 'consistent' | 'cant-tell';

export type RungName = 'preset' | 'response' | 'friction-force';

export interface CalibrationEvidence {
  logs: number;
  presetErrorRad: number;
  fittedErrorRad: number;
  gain: number;
  explained: number;
  reason: string;
}

export interface CalibrationRecord {
  verdict: CalibrationVerdict;
  version: number;
  rung: RungName;
  fit: ServoFit;
  volts: number;
  scales: Record<string, number>;
  conditions: { volts: number; temperatureC: number };
  evidence: CalibrationEvidence;
  logId?: string;
}

export type ServoCalibration = CalibrationRecord & ({ servo: ServoPart } | { family: FamilyName });
