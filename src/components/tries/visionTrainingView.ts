import type { VisionKind } from '../../vision/manifest';

export type TrainingTask = Exclude<VisionKind, 'depth'>;

export const VISION_TASK_OPTIONS: { value: TrainingTask; label: string }[] = [
  { value: 'detect', label: 'Detect Objects' },
  { value: 'segment', label: 'Segment Objects' },
  { value: 'keypoints', label: 'Find Keypoints' },
  { value: 'classify', label: 'Classify Images' },
];

export interface VisionAttemptView {
  id: string;
  at: string;
  retained: boolean;
  active?: boolean;
  targets?: { id: string; name: string }[];
  reason: string;
  metrics: { name: string; value: string }[];
  failures: { className: string; missed: number; falsePositives: number }[];
  inferenceMs: number;
  bytes: number;
}

export interface VisionTrainingView {
  task: TrainingTask;
  setTask: (task: TrainingTask) => void;
  attempts: VisionAttemptView[];
  running: boolean;
  maxInferenceMs: number;
  setMaxInferenceMs: (value: number) => void;
  maxModelBytes: number;
  setMaxModelBytes: (value: number) => void;
  progress: string;
  stop: () => void;
  targets: { id: string; name: string }[];
  apply: (runId: string, targetId: string) => void;
}
