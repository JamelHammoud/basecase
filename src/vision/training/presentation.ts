import type { TrainingMetric } from './types';

export const TRAINING_METRIC_LABELS: Record<TrainingMetric, string> = {
  'box-map': 'Box mAP',
  'mask-map': 'Mask mAP',
  'keypoint-pck': 'Keypoint accuracy',
  accuracy: 'Accuracy',
};

export const trainingScore = (value: number | null) => (value === null ? 'Unmeasured' : `${(value * 100).toFixed(1)}%`);
