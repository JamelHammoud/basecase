import type { TrainingTask, TrainingEvaluationInput } from './types';
import type { VisionDetection, VisionResult } from '../types';

export const trainingMetrics = {
  detect: 'box-map',
  segment: 'mask-map',
  keypoints: 'keypoint-pck',
  classify: 'accuracy',
} as const;

const finite = (value: number) => Number.isFinite(value) && value >= 0;
const unit = (value: number) => finite(value) && value <= 1;
const distinct = (values: unknown[]) => new Set(values).size === values.length;

export function validateTrainingTask(task: TrainingTask): void {
  if (!task || !Object.hasOwn(trainingMetrics, task.kind) || task.metric !== trainingMetrics[task.kind])
    throw new Error('Choose a metric for this vision task.');

  if (
    !Array.isArray(task.classes) ||
    !task.classes.length ||
    task.classes.length > 1000 ||
    !task.classes.every(
      (category) =>
        Number.isInteger(category.id) &&
        category.id >= 0 &&
        typeof category.name === 'string' &&
        category.name.trim().length > 0 &&
        category.name.length <= 200,
    ) ||
    !distinct(task.classes.map((category) => category.id)) ||
    !distinct(task.classes.map((category) => category.name))
  )
    throw new Error('Choose distinct labeled classes.');

  if (
    task.kind === 'keypoints' &&
    !task.classes.every(
      (category) =>
        category.keypoints?.length &&
        distinct(category.keypoints) &&
        category.keypoints.every((name) => typeof name === 'string' && name.trim().length > 0),
    )
  )
    throw new Error('Name the keypoints for every class.');

  if (task.keypointTolerance !== undefined && (!unit(task.keypointTolerance) || task.keypointTolerance === 0))
    throw new Error('Choose a keypoint tolerance above zero and at most one.');

  validateLimits(task);
}

function validateLimits(task: TrainingTask) {
  const limits = task.limits;

  if (
    !limits ||
    Object.keys(limits).some((key) => !['maxInferenceMs', 'maxModelBytes', 'maxClassFailureRate'].includes(key))
  )
    throw new Error('Choose supported inference and class limits.');

  if (
    (limits.maxInferenceMs !== undefined && !finite(limits.maxInferenceMs)) ||
    (limits.maxModelBytes !== undefined && (!Number.isSafeInteger(limits.maxModelBytes) || limits.maxModelBytes < 1)) ||
    (limits.maxClassFailureRate !== undefined && !unit(limits.maxClassFailureRate))
  )
    throw new Error('Choose bounded inference and class limits.');
}

function validDetection(detection: VisionDetection, task: TrainingTask): boolean {
  return (
    task.classes.some((category) => category.name === detection.label) &&
    unit(detection.score) &&
    detection.box.length === 4 &&
    detection.box.every(unit) &&
    detection.box[0] + detection.box[2] <= 1 + 1e-9 &&
    detection.box[1] + detection.box[3] <= 1 + 1e-9 &&
    (!detection.keypoints || detection.keypoints.every((point) => point.length === 2 && point.every(unit))) &&
    validMask(detection.mask)
  );
}

function validMask(mask: VisionDetection['mask']) {
  if (!mask) return true;

  return (
    Number.isInteger(mask.width) &&
    Number.isInteger(mask.height) &&
    mask.width > 0 &&
    mask.height > 0 &&
    mask.width * mask.height <= 16_777_216 &&
    mask.values instanceof Uint8Array &&
    mask.values.length === mask.width * mask.height &&
    mask.values.every((value) => value === 0 || value === 1)
  );
}

export function validatePrediction(result: VisionResult, task: TrainingTask): void {
  if (
    !Array.isArray(result.detections) ||
    result.detections.length > 10000 ||
    !result.detections.every((detection) => validDetection(detection, task))
  )
    throw new Error('Check the test prediction geometry and classes.');

  if (
    result.classes &&
    (!result.classes.every(
      (category) => unit(category.score) && task.classes.some((item) => item.name === category.label),
    ) ||
      !distinct(result.classes.map((category) => category.label)))
  )
    throw new Error('Check the test prediction class scores.');
}

export function validateEvaluationInput(input: TrainingEvaluationInput): void {
  validateTrainingTask(input.task);

  if (!/^[a-f0-9]{64}$/.test(input.modelHash) || !Number.isSafeInteger(input.modelBytes) || input.modelBytes < 1)
    throw new Error('Check the trained model hash and byte count.');

  if (input.predictions.some((prediction) => !finite(prediction.inferenceMs)))
    throw new Error('Measure a finite inference cost for every test prediction.');

  if (
    !distinct(input.snapshot.map((sample) => `${sample.frameSetId}:${sample.frameId}`)) ||
    !distinct(input.predictions.map((prediction) => `${prediction.frameSetId}:${prediction.frameId}`))
  )
    throw new Error('Use one frozen sample and prediction for each test image.');
}
