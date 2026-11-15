import { clamp01, imageBox, suppress } from './boxes';
import type { ImageTransform } from './preprocess';
import type { VisionDetection, VisionOutputs } from './types';
import { tensorShape } from './tensor';

function faceAt(
  outputs: VisionOutputs,
  transform: ImageTransform,
  stride: number,
  index: number,
): VisionDetection | null {
  const cls = outputs[`cls_${stride}`];
  const obj = outputs[`obj_${stride}`];
  const bbox = outputs[`bbox_${stride}`];
  const kps = outputs[`kps_${stride}`];

  if (!cls || !obj || !bbox || !kps) throw new Error('The face detector returned unsupported tensors.');

  const score = Math.sqrt(clamp01(Number(cls.data[index])) * clamp01(Number(obj.data[index])));

  if (score < 0.6) return null;

  const x = index % (transform.width / stride);
  const y = Math.floor(index / (transform.width / stride));
  const cx = (x + Number(bbox.data[index * 4])) * stride;
  const cy = (y + Number(bbox.data[index * 4 + 1])) * stride;
  const w = Math.exp(Number(bbox.data[index * 4 + 2])) * stride;
  const h = Math.exp(Number(bbox.data[index * 4 + 3])) * stride;
  const keypoints: [number, number][] = Array.from({ length: 5 }, (_, p) => [
    clamp01(((x + Number(kps.data[index * 10 + p * 2])) * stride - transform.left) / transform.scaledWidth),
    clamp01(((y + Number(kps.data[index * 10 + p * 2 + 1])) * stride - transform.top) / transform.scaledHeight),
  ]);

  return { label: 'face', score, box: imageBox([cx - w / 2, cy - h / 2, w, h], transform), keypoints };
}

export function decodeFace(outputs: VisionOutputs, transform: ImageTransform) {
  const result: VisionDetection[] = [];

  for (const stride of [8, 16, 32]) {
    const count = (transform.width / stride) * (transform.height / stride);

    for (const [name, channels] of [
      ['cls', 1],
      ['obj', 1],
      ['bbox', 4],
      ['kps', 10],
    ] as const) {
      const { dims } = tensorShape(outputs[`${name}_${stride}`], 2);

      if (dims[0] !== count || dims[1] !== channels) throw new Error('The face detector returned unsupported tensors.');
    }

    for (let i = 0; i < count; i++) {
      const face = faceAt(outputs, transform, stride, i);

      if (face) result.push(face);
    }
  }

  return suppress(result, 0.3);
}
