import type { FrozenImageSample } from '../../datasets/snapshotImages';
import type { FrameSet, ImageClass } from '../frameSet';
import type { VisionResult } from '../types';
import type { TrainingRequirement, RequirementOutcome } from './requirementTypes';
import type { PredictionEvidence } from './evidenceTypes';

export type TrainingKind = 'detect' | 'segment' | 'keypoints' | 'classify';
export type TrainingMetric = 'box-map' | 'mask-map' | 'keypoint-pck' | 'accuracy';

export interface TrainingLimits {
  maxInferenceMs?: number;
  maxModelBytes?: number;
  maxClassFailureRate?: number;
}

export interface TrainingTask {
  kind: TrainingKind;
  classes: ImageClass[];
  metric: TrainingMetric;
  limits: TrainingLimits;
  requirements?: TrainingRequirement[];
  keypointTolerance?: number;
}

export interface TrainingPrediction {
  frameSetId: string;
  frameId: string;
  result: VisionResult;
  inferenceMs: number;
}

export interface TrainingEvaluationInput {
  task: TrainingTask;
  sets: FrameSet[];
  snapshot: FrozenImageSample[];
  realSourceIds: string[];
  predictions: TrainingPrediction[];
  modelHash: string;
  modelBytes: number;
}

export interface ClassEvaluation {
  classId: number;
  name: string;
  support: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  failureRate: number;
  score: number | null;
  keypoints?: { visible: number; correct: number };
}

export interface TrainingEvaluation {
  version: 1;
  protocol: 'vision-eval-v1';
  task: TrainingTask;
  modelHash: string;
  snapshot: FrozenImageSample[];
  realTest: FrozenImageSample[];
  testHash: string;
  evidence?: PredictionEvidence;
  requirementEvidenceFailure?: 'resources';
  metrics: {
    primary: number | null;
    perClass: ClassEvaluation[];
    inference: { samples: number; meanMs: number; p95Ms: number; modelBytes: number };
  };
}

export type TrainingRetentionReason =
  | 'improved'
  | 'no-real-test'
  | 'no-incumbent'
  | 'different-test'
  | 'different-task'
  | 'limits'
  | 'no-improvement'
  | 'requirements';

export interface TrainingComparisonAttempt {
  id: string;
  at: string;
  candidateHash: string;
  incumbentHash?: string;
  testHash: string;
  metric: TrainingMetric;
  candidateScore: number | null;
  incumbentScore: number | null;
  previousAttempts: number;
  requirements?: RequirementOutcome[];
  status: 'retained' | 'checkpoint';
  reason: TrainingRetentionReason;
}

export interface TrainingComparisonInput {
  id: string;
  at: string;
  candidate: TrainingEvaluation;
  incumbent?: TrainingEvaluation;
  history: TrainingComparisonAttempt[];
}
