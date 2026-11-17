import type { FrozenImageSample } from '../../datasets/snapshotImages';
import type { ImageMask } from '../frameSet';
import type { VisionDetection, VisionResult } from '../types';
import type { ClassEvaluation } from './types';

export type ImageDiagnostics = Pick<
  ClassEvaluation,
  'classId' | 'support' | 'truePositive' | 'falsePositive' | 'falseNegative' | 'keypoints'
> & { overlapMatches?: number[] };

export interface EvidencePrediction {
  width: number;
  height: number;
  detections: (Omit<VisionDetection, 'mask'> & { mask?: ImageMask })[];
  classes?: VisionResult['classes'];
}

export interface PredictionEvidence {
  version: 1;
  hash: string;
  modelHash: string;
  testHash: string;
  groupsHash?: string;
  frames: {
    sample: FrozenImageSample;
    prediction: EvidencePrediction;
    classes: ImageDiagnostics[];
  }[];
}
