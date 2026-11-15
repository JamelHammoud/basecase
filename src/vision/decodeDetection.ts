import type { VisionManifest } from './manifest';
import type { ImageTransform } from './preprocess';
import type { VisionDetection, VisionOutputs } from './types';
import { imageBox, suppress } from './boxes';
import { MAX_DETECTION_ROWS, tensorShape } from './tensorShape';

const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

export function decodeRfdetr(outputs: VisionOutputs, manifest: VisionManifest, transform: ImageTransform) {
  const { tensor: boxes, dims: boxDims } = tensorShape(outputs.pred_boxes, 2);
  const { tensor: logits, dims: logitDims } = tensorShape(outputs.pred_logits, 2);

  if (
    boxDims[1] !== 4 ||
    logitDims[1] !== manifest.classes.length ||
    boxDims[0] !== logitDims[0] ||
    boxDims[0] > MAX_DETECTION_ROWS
  )
    throw new Error('The detector returned unsupported tensors.');

  const result: VisionDetection[] = [];
  const classes = manifest.classes.length;
  const count = boxDims[0];

  for (let i = 0; i < count; i++) {
    let best = 0;
    let score = 0;

    for (let c = 0; c < classes; c++) {
      const next = sigmoid(Number(logits.data[i * classes + c]));

      if (manifest.classes[c] && next > score) {
        score = next;
        best = c;
      }
    }

    if (score < 0.25) continue;

    const [cx, cy, w, h] = Array.from({ length: 4 }, (_, n) => Number(boxes.data[i * 4 + n]));

    result.push({
      label: manifest.classes[best],
      score,
      box: imageBox(
        [(cx - w / 2) * transform.width, (cy - h / 2) * transform.height, w * transform.width, h * transform.height],
        transform,
      ),
    });
  }

  return result.sort((a, b) => b.score - a.score).slice(0, 300);
}

export function decodeYolo(outputs: VisionOutputs, manifest: VisionManifest, transform: ImageTransform) {
  const { tensor, dims } = tensorShape(Object.values(outputs)[0], 2);
  const channels = manifest.classes.length + 4;
  const count = dims[1];

  if (dims[0] !== channels || count > MAX_DETECTION_ROWS) throw new Error('The detector returned unsupported tensors.');

  const result: VisionDetection[] = [];

  for (let i = 0; i < count; i++) {
    let best = 0;
    let score = 0;

    for (let c = 0; c < manifest.classes.length; c++) {
      const next = Number(tensor.data[(c + 4) * count + i]);

      if (next > score) {
        score = next;
        best = c;
      }
    }

    if (score < 0.25) continue;

    const [cx, cy, w, h] = Array.from({ length: 4 }, (_, n) => Number(tensor.data[n * count + i]));

    result.push({ label: manifest.classes[best], score, box: imageBox([cx - w / 2, cy - h / 2, w, h], transform) });
  }

  return suppress(result);
}
