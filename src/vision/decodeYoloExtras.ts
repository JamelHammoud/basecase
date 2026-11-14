import type { VisionOutputs, VisionTensor } from './decode';
import type { VisionModelManifest } from './manifest';
import type { FrameTransform } from './preprocess';
import type { VisionDetection } from './protocol';

export interface YoloExtras {
  output: VisionTensor;
  outputs: VisionOutputs;
  model: VisionModelManifest;
  transform: FrameTransform;
  index: number;
}

function keypoints(extras: YoloExtras): NonNullable<VisionDetection['keypoints']> {
  const { output, model, index, transform } = extras;
  const count = output.dims[2];
  const start = 4 + model.classes.length;
  const length = (output.dims[1] - start) / 3;

  if (!Number.isInteger(length) || length < 1) throw new Error('Model keypoint layout couldn’t be read.');

  return Array.from({ length }, (_, point) => ({
    x: (Number(output.data[(start + point * 3) * count + index]) - transform.offsetX) / transform.resizedWidth,
    y: (Number(output.data[(start + point * 3 + 1) * count + index]) - transform.offsetY) / transform.resizedHeight,
    score: Number(output.data[(start + point * 3 + 2) * count + index]),
  })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.score));
}

function maskPixel(item: VisionDetection, extras: YoloExtras, prototype: VisionTensor, index: number): number {
  const [, channels, height, width] = prototype.dims;
  const x = ((index % width) + 0.5) / width;
  const y = (Math.floor(index / width) + 0.5) / height;

  if (x < item.box[0] || y < item.box[1] || x > item.box[0] + item.box[2] || y > item.box[1] + item.box[3]) return 0;

  const { transform, output, model } = extras;
  const px = Math.min(
    width - 1,
    Math.floor(((x * transform.resizedWidth + transform.offsetX) / transform.inputWidth) * width),
  );
  const py = Math.min(
    height - 1,
    Math.floor(((y * transform.resizedHeight + transform.offsetY) / transform.inputHeight) * height),
  );
  let logit = 0;

  for (let channel = 0; channel < channels; channel++) {
    const coefficient = Number(output.data[(4 + model.classes.length + channel) * output.dims[2] + extras.index]);

    logit += coefficient * Number(prototype.data[(channel * height + py) * width + px]);
  }

  return Number(logit > 0);
}

function mask(item: VisionDetection, extras: YoloExtras): NonNullable<VisionDetection['mask']> {
  const prototype = Object.values(extras.outputs).find((tensor) => tensor.dims.length === 4);

  if (!prototype || prototype.dims[1] !== extras.output.dims[1] - extras.model.classes.length - 4)
    throw new Error('Model mask layout couldn’t be read.');

  const [, , height, width] = prototype.dims;
  const values = Uint8Array.from({ length: width * height }, (_, index) => maskPixel(item, extras, prototype, index));

  return { width, height, values };
}

export function yoloExtras(item: VisionDetection, extras: YoloExtras): VisionDetection {
  if (extras.model.kind === 'keypoints') return { ...item, keypoints: keypoints(extras) };

  if (extras.model.kind === 'segment') return { ...item, mask: mask(item, extras) };

  return item;
}
