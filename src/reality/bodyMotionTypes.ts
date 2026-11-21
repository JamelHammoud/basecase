import type {
  BodyAnalysisDirection,
  BodyAnalysisRequest,
  BodyAnalysisResult,
  BodyAnalysisRefusal,
} from './bodyAnalysisTypes';
import type { RobotRun } from '../robot/runBuffer';
import type { ScenePart } from '../types/robotics';
import type { SimModel } from '../sim/mjcfTypes';

export const BODY_PREVIEW_VERTICES = 32_768;

export const BODY_MOTION_LIMITS = Object.freeze({
  candidates: 6,
  seconds: 2,
  frames: 65,
  physicsSteps: 1_000_000,
  speedRadS: 0.6,
  speedMS: 0.03,
  effort: 100,
  workJ: 20,
});

export const BODY_MOTION_METHOD = Object.freeze({
  version: 'body-motion-1',
  library: 'joint-hold-ramp-oscillation-1',
  ranking: 'minimum-profiled-original-weak-response-1',
  tieBreak: 'library-order',
  minimumGain: 0.1,
  basisTolerance: 1e-8,
});

export interface BodyMotionRequest {
  speedRadS?: number;
  request: BodyAnalysisRequest;
  result: BodyAnalysisResult;
  selected: number[];
}

export interface BodyMotionPlan {
  id: string;
  joint: string;
  shape: 'hold' | 'ramp' | 'oscillation';
  seconds: number;
  workBoundJ: number;
  run: RobotRun;
}

export interface BodyMotionScore {
  before: number;
  after: number;
  gain: number;
  resolved: boolean;
  directions: BodyAnalysisDirection[];
}

export interface BodyMotionCandidate {
  plan: BodyMotionPlan;
  score: BodyMotionScore;
}

export interface BodyMotionPreview {
  times: number[];
  positions: number[][];
  units: Array<'rad' | 'm'>;
  poses: number[][];
  parts: ScenePart[];
  bodies: SimModel['bodies'];
}

interface BodyMotionEvidence {
  speedRadS?: number;
  method: typeof BODY_MOTION_METHOD;
  selected: number[];
  candidates: BodyMotionCandidate[];
  physicsSteps: number;
}

export type BodyMotionOutcome = BodyMotionEvidence &
  (
    | {
        kind: 'recommended';
        plan: BodyMotionPlan;
        score: BodyMotionScore;
        preview: BodyMotionPreview;
      }
    | { kind: 'no-improvement' }
    | { kind: 'refused'; reason: BodyAnalysisRefusal }
  );
