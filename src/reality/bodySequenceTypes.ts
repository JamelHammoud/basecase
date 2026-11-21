import type { RobotRun } from '../robot/runBuffer';
import type {
  BodyAnalysisDirection,
  BodyAnalysisRequest,
  BodyAnalysisResult,
  BodyAnalysisRefusal,
} from './bodyAnalysisTypes';
import type { BodyMotionPlan, BodyMotionCandidate } from './bodyMotionTypes';
import type { BodyCalibration, BodyFit } from './bodyTypes';

export const BODY_SEQUENCE_LIMITS = Object.freeze({
  rounds: 4,
  seconds: 8,
  physicsSteps: 1_000_000,
  bytes: 4_194_304,
  retainedBytes: 134_217_728,
});

export const BODY_SEQUENCE_METHOD = Object.freeze({
  version: 'body-sequence-1',
  ranking: 'capped-original-weak-subspace-response-1',
  start: 'retained-pose-zero-velocity-reset',
  backend: 'mujoco',
});

export type BodySequenceLimits = { [Key in keyof typeof BODY_SEQUENCE_LIMITS]: number };
export type BodySequenceReason =
  BodyAnalysisRefusal | 'resolved' | 'no-improvement' | 'rounds' | 'duration' | 'storage';

export interface BodySequenceRound {
  plan: BodyMotionPlan;
  run: RobotRun;
  initialState: number[];
  analysis: BodyAnalysisResult;
  contribution: number;
  candidates: BodyMotionCandidate[];
  directions: BodyAnalysisDirection[];
  physicsSteps: number;
}

export interface BodySequence {
  method: typeof BODY_SEQUENCE_METHOD;
  source: string;
  selected: number[];
  original: BodyAnalysisResult;
  simulationFit: BodyFit;
  library?: Array<{ plan: BodyMotionPlan; directions: BodyAnalysisDirection[] }>;
  candidates?: BodyMotionCandidate[];
  limits: BodySequenceLimits;
  validation: RobotRun;
  validationInitialState: number[];
  mujocoVersion?: number;
  rounds: BodySequenceRound[];
  directions: BodyAnalysisDirection[];
  spent: { physicsSteps: number; seconds: number };
  reason: BodySequenceReason | null;
  validationResult?: BodyCalibration;
  validationRefusal?: BodyAnalysisRefusal;
}

export interface BodySequenceRequest {
  request: BodyAnalysisRequest;
  result: BodyAnalysisResult;
  selected: number[];
  limits: BodySequenceLimits;
}
