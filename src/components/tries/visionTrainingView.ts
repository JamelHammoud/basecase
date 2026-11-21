import type { TrainingRequirement, RequirementOutcome } from '../../vision/training/requirementTypes';
import type { InspectionNavigation } from '../../workspace/visionInspectionNavigation';
import type { VisionInspectionReports } from './useVisionInspection';
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
  inspection?: VisionInspectionReports;
  navigation?: InspectionNavigation;
  active?: boolean;
  targets?: { id: string; name: string }[];
  reason: string;
  requirements?: RequirementOutcome[];
  metrics: { name: string; value: string }[];
  failures: { className: string; missed: number; falsePositives: number }[];
  inferenceMs: number | null;
  bytes: number;
}

export interface VisionTrainingView {
  inspectionContext?: string;
  requirements?: TrainingRequirement[];
  setRequirements?: (values: TrainingRequirement[]) => void;
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
