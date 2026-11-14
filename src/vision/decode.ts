import type { VisionModelManifest } from './manifest';
import type { FrameTransform } from './preprocess';
import { sourceBox } from './preprocess';
import type { VisionDetection, VisionResult } from './protocol';
import { decodeYunet } from './decodeYunet';
import { yoloExtras } from './decodeYoloExtras';

export interface VisionTensor {
  dims: readonly number[];
  data: ArrayLike<number>;
}

export type VisionOutputs = Record<string, VisionTensor>;
export type DecodedVision = Pick<VisionResult, 'detections' | 'classes' | 'depth'>;
export const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

export function suppressBoxes(detections: VisionDetection[], threshold = 0.45): VisionDetection[] {
  const selected: VisionDetection[] = [];
  const sorted = detections
    .filter((detection) => Number.isFinite(detection.score) && detection.box.every(Number.isFinite))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3000);

  for (const detection of sorted) {
    const overlaps = selected.some(
      (previous) => previous.classId === detection.classId && overlap(previous.box, detection.box) > threshold,
    );

    if (!overlaps) selected.push(detection);

    if (selected.length >= 300) break;
  }

  return selected;
}

function overlap(a: number[], b: number[]): number {
  const width = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const height = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const intersection = width * height;
  const union = a[2] * a[3] + b[2] * b[3] - intersection;

  return union > 0 ? intersection / union : 0;
}

function firstTensor(outputs: VisionOutputs): VisionTensor {
  const output = Object.values(outputs)[0];

  if (!output || output.dims.reduce((count, value) => count * value, 1) !== output.data.length)
    throw new Error('Model output couldn’t be read.');

  return output;
}

function detection(
  model: VisionModelManifest,
  values: number[],
  classScore: { classId: number; score: number },
  transform: FrameTransform,
): VisionDetection {
  return {
    classId: classScore.classId,
    label: model.classes[classScore.classId] ?? String(classScore.classId),
    score: classScore.score,
    box: sourceBox([values[0] - values[2] / 2, values[1] - values[3] / 2, values[2], values[3]], transform),
  };
}

function yolo(
  outputs: VisionOutputs,
  model: VisionModelManifest,
  transform: FrameTransform,
  threshold: number,
): DecodedVision {
  const output = firstTensor(outputs);
  const [, channels, count] = output.dims;

  if (output.dims.length !== 3 || channels < model.classes.length + 4 || count < 1)
    throw new Error('Model detection layout couldn’t be read.');

  const detections: VisionDetection[] = [];
  const indices = new Map<VisionDetection, number>();

  for (let index = 0; index < count; index++) {
    const scores = model.classes.map((_, classId) => Number(output.data[(4 + classId) * count + index]));
    const score = Math.max(...scores);
    const classId = scores.indexOf(score);

    if (!Number.isFinite(score) || score < threshold) continue;

    const values = Array.from({ length: 4 }, (_, channel) => Number(output.data[channel * count + index]));
    const item = detection(model, values, { classId, score }, transform);

    detections.push(item);
    indices.set(item, index);
  }

  return {
    detections: suppressBoxes(detections).map((item) =>
      yoloExtras(item, { output, outputs, model, transform, index: indices.get(item) ?? 0 }),
    ),
  };
}

function rfdetr(
  outputs: VisionOutputs,
  model: VisionModelManifest,
  transform: FrameTransform,
  threshold: number,
): DecodedVision {
  const boxes = outputs.dets ?? outputs.pred_boxes;
  const logits = outputs.labels ?? outputs.pred_logits;

  if (
    !boxes ||
    !logits ||
    boxes.dims.length !== 3 ||
    boxes.dims[2] !== 4 ||
    logits.dims.length !== 3 ||
    logits.dims[1] !== boxes.dims[1]
  )
    throw new Error('Model detection layout couldn’t be read.');

  const classes = logits.dims[2];
  const detections: VisionDetection[] = [];

  for (let index = 0; index < boxes.dims[1]; index++) {
    const scores = Array.from({ length: classes }, (_, classId) =>
      sigmoid(Number(logits.data[index * classes + classId])),
    );
    const score = Math.max(...scores);
    const classId = scores.indexOf(score);

    if (!Number.isFinite(score) || score < threshold || !model.classes[classId]) continue;

    const values = Array.from(
      { length: 4 },
      (_, channel) => Number(boxes.data[index * 4 + channel]) * model.inputSize[channel % 2],
    );
    const item = detection(model, values, { classId, score }, transform);

    if (item.box.every(Number.isFinite)) detections.push(item);
  }

  return { detections: detections.sort((a, b) => b.score - a.score).slice(0, 300) };
}

function depth(outputs: VisionOutputs, model: VisionModelManifest): DecodedVision {
  const output = firstTensor(outputs);
  const width = output.dims.at(-1) ?? 0;
  const height = output.dims.at(-2) ?? 0;

  if (
    width < 1 ||
    height < 1 ||
    width * height !== output.data.length ||
    Array.from(output.data).some((value) => !Number.isFinite(value))
  )
    throw new Error('Model depth map couldn’t be read.');

  return { depth: { width, height, values: Float32Array.from(output.data), units: model.depthUnits ?? 'relative' } };
}

function classify(outputs: VisionOutputs, model: VisionModelManifest): DecodedVision {
  const output = firstTensor(outputs);
  const scores = Array.from(output.data);
  const maximum = Math.max(...scores);
  const exponential = scores.map((score) => Math.exp(score - maximum));
  const total = exponential.reduce((sum, score) => sum + score, 0);

  return {
    classes: exponential
      .map((score, classId) => ({ classId, label: model.classes[classId] ?? String(classId), score: score / total }))
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score),
  };
}

export function decodeVision(
  outputs: VisionOutputs,
  model: VisionModelManifest,
  transform: FrameTransform,
  threshold = 0.5,
): DecodedVision {
  if (model.adapter === 'yolo') return yolo(outputs, model, transform, threshold);

  if (model.adapter === 'rfdetr') return rfdetr(outputs, model, transform, threshold);

  if (model.adapter === 'yunet')
    return { detections: suppressBoxes(decodeYunet(outputs, model, transform, threshold), 0.3) };

  if (model.adapter === 'depth') return depth(outputs, model);

  return classify(outputs, model);
}
