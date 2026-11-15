export interface BodyFit {
  massScales: Record<string, number>;
  payloadKg: Record<string, number>;
  floorFrictionScale: number;
}

export type BodyErrorUnits = 'rad' | 'm' | 'mixed';

export interface BodyCalibration {
  version: number;
  verdict: 'measured' | 'cant-tell';
  robot: string;
  fit: BodyFit;
  evidence: { presetErrorRad: number; fittedErrorRad: number; gain: number; units?: BodyErrorUnits };
  modelFingerprint: string;
  recordedAt?: string;
  bodyKeys?: Record<string, string>;
}

export interface BodyHistory {
  versions: BodyCalibration[];
  active: number | null;
}
