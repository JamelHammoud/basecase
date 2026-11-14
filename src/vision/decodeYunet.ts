import type { VisionOutputs } from './decode';
import type { VisionModelManifest } from './manifest';
import type { FrameTransform } from './preprocess';
import { sourceBox } from './preprocess';
import type { VisionDetection } from './protocol';

interface YunetLevel {
  stride: number;
  index: number;
  columns: number;
  outputs: VisionOutputs;
  transform: FrameTransform;
}

function yunetBox(level: YunetLevel): VisionDetection {
  const { stride, index, columns, outputs, transform } = level;
  const box = outputs[`bbox_${stride}`].data;
  const points = outputs[`kps_${stride}`].data;
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = (column + Number(box[index * 4])) * stride;
  const y = (row + Number(box[index * 4 + 1])) * stride;
  const width = Math.exp(Number(box[index * 4 + 2])) * stride;
  const height = Math.exp(Number(box[index * 4 + 3])) * stride;
  const score = Math.sqrt(
    Math.max(0, Math.min(1, Number(outputs[`cls_${stride}`].data[index]))) *
      Math.max(0, Math.min(1, Number(outputs[`obj_${stride}`].data[index]))),
  );
  const keypoints = Array.from({ length: 5 }, (_, point) => ({
    x: ((Number(points[index * 10 + point * 2]) + column) * stride - transform.offsetX) / transform.resizedWidth,
    y: ((Number(points[index * 10 + point * 2 + 1]) + row) * stride - transform.offsetY) / transform.resizedHeight,
    score,
  }));

  return {
    classId: 0,
    label: 'face',
    score,
    box: sourceBox([x - width / 2, y - height / 2, width, height], transform),
    keypoints,
  };
}

export function decodeYunet(
  outputs: VisionOutputs,
  model: VisionModelManifest,
  transform: FrameTransform,
  threshold: number,
): VisionDetection[] {
  const detections: VisionDetection[] = [];

  for (const stride of [8, 16, 32]) {
    const columns = Math.floor(model.inputSize[0] / stride);
    const count = columns * Math.floor(model.inputSize[1] / stride);
    const names = ['cls', 'obj', 'bbox', 'kps'];

    if (names.some((name) => !outputs[`${name}_${stride}`])) throw new Error('Model face layout couldn’t be read.');

    for (let index = 0; index < count; index++) {
      const item = yunetBox({ stride, index, columns, outputs, transform });

      if (Number.isFinite(item.score) && item.score >= threshold) detections.push(item);
    }
  }

  return detections;
}
