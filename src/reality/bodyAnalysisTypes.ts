import type { RobotRun } from '../robot/runBuffer';
import type { SimModel } from '../sim/mjcfTypes';
import type { BodyFit } from './bodyTypes';

export const BODY_ANALYSIS_LIMITS = Object.freeze({
  parameters: 24,
  joints: 16,
  samples: 256,
  intents: 2048,
  inputSamples: 4096,
  durationMs: 20_000,
  xmlBytes: 1_048_576,
  stepBudget: 1_000_000,
});

export const BODY_ANALYSIS_METHOD = Object.freeze({
  version: 'body-sensitivity-1',
  noiseRad: 0.0015,
  noiseM: 0.00001,
  absoluteResponse: 3,
  relativeResponse: 0.01,
  directionLoading: 0.1,
  orthogonalityTolerance: 1e-12,
  sweeps: 64,
});

export interface BodyAnalysisSource {
  recording: string;
  unit: string;
  scene: string;
  modelHash: string;
  modelFingerprint: string;
  calibrationFingerprint: string;
}

export interface BodyAnalysisRequest {
  observations?: 'servo-independent-1';
  model: SimModel;
  nominal?: BodyFit;
  run: RobotRun;
  robot: string;
  units: Array<'rad' | 'm'>;
  source: BodyAnalysisSource;
}

export type BodyDistinguishability = 'distinguishable' | 'coupled' | 'poor-excitation';

export interface BodyAnalysisParameter {
  body: string;
  label: string;
  kind: keyof BodyFit;
  unit: 'scale' | 'kg';
  nominal: number;
  bounds: [number, number];
  probe: [number, number];
  scale: number;
  response: number;
  distinguishability: BodyDistinguishability;
}

export interface BodyAnalysisDirection {
  weights: number[];
  response: number;
  distinguishable: boolean;
}

export type BodyAnalysisRefusal =
  'cancelled' | 'provenance' | 'units' | 'recording' | 'budget' | 'unsupported' | 'numerical' | 'backend';

export interface BodyAnalysisResult {
  kind: 'analyzed';
  source: BodyAnalysisSource;
  robot: string;
  method: typeof BODY_ANALYSIS_METHOD;
  interval: [number, number];
  samples: number;
  replays: number;
  parameters: BodyAnalysisParameter[];
  directions: BodyAnalysisDirection[];
  residual: {
    rmsNoise: number;
    modelExplainsObservations: boolean;
    outsideSupportedDirections: number;
    unresolved: boolean;
  };
}

export type BodyAnalysisOutcome =
  BodyAnalysisResult | { kind: 'refused'; reason: BodyAnalysisRefusal; replays: number };
