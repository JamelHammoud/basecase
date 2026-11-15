import type { Dataset } from '../../datasets/datasetFile';
import type { VisionManifest } from '../manifest';
import type { prepareVisionTraining } from './prepare';
import type {
  TrainingComparisonAttempt,
  TrainingEvaluation,
  TrainingKind,
  TrainingLimits,
  TrainingTask,
} from './types';

export type PreparedVisionTraining = Awaited<ReturnType<typeof prepareVisionTraining>>;
export interface TrainingOptions {
  signal?: AbortSignal;
  limits?: TrainingLimits;
  onProgress?: (message: string) => void;
}
export interface TrainingArtifacts {
  manifest: VisionManifest;
  baseline: VisionManifest;
  jobId: string;
  checkpoint: string;
  parity: { maxAbsoluteError: number; tolerance: number };
}
export interface TrainingRun extends TrainingArtifacts {
  version: 1;
  id: string;
  datasetId: string;
  datasetVersion: number;
  at: string;
  kind: TrainingKind;
  status: 'retained' | 'checkpoint';
  reason: string;
  comparison: TrainingComparisonAttempt;
  report: TrainingEvaluation;
  incumbentReport: TrainingEvaluation;
  provenance: PreparedVisionTraining['provenance'];
}
export interface TrainingTarget {
  scene: string;
  camera: string;
  node: string;
}
export interface TrainingServicePorts {
  prepare: (dataset: Dataset, kind: TrainingKind) => Promise<PreparedVisionTraining>;
  train: (prepared: PreparedVisionTraining, task: TrainingTask, options: TrainingOptions) => Promise<TrainingArtifacts>;
  evaluate: (
    prepared: PreparedVisionTraining,
    task: TrainingTask,
    model: VisionManifest,
    signal?: AbortSignal,
  ) => Promise<TrainingEvaluation>;
  load: (datasetId: string) => Promise<TrainingRun[]>;
  save: (run: TrainingRun) => Promise<void>;
  now: () => string;
  id: () => string;
}
export interface VisionTrainingTestPort {
  train: (dataset: Dataset, kind: TrainingKind, options: TrainingOptions) => Promise<TrainingRun>;
  load: (datasetId: string) => Promise<TrainingRun[]>;
  apply: (run: TrainingRun, target: TrainingTarget) => Promise<void>;
}
