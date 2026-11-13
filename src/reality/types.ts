import type { ServoFit } from '../data/components';

export type ServoFamily = 'sts3215' | 'xl330';

export interface BenchPayload {
  massKg: number;
  armM: number;
}

export interface ServoLog {
  family: ServoFamily;
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

export interface ServoCalibration {
  verdict: CalibrationVerdict;
  family: ServoFamily;
  version: number;
  rung: RungName;
  fit: ServoFit;
  volts: number;
  scales: Record<string, number>;
  conditions: { volts: number; temperatureC: number };
  evidence: CalibrationEvidence;
  logId?: string;
}
