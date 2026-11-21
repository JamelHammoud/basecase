import type { TrainingMetric } from './types';

export interface TrainingRequirement {
  group: { kind: 'condition' | 'camera'; name: string };
  classId?: number;
  className?: string;
  metric: TrainingMetric;
  minScore: number;
  minRealTest: number;
  maxRegression: number;
}

export type RequirementMeasurementReason =
  'measured' | 'missing-group' | 'insufficient-support' | 'unavailable' | 'resources';

export interface RequirementMeasurement {
  requirement: TrainingRequirement;
  indices: number[];
  support: number;
  score: number | null;
  reason: RequirementMeasurementReason;
}

export interface RequirementOutcome {
  requirement: TrainingRequirement;
  candidate: number | null;
  incumbent: number | null;
  support: number;
  reason: Exclude<RequirementMeasurementReason, 'measured'> | 'floor' | 'regression' | 'passed';
}
