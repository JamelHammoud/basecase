import type { VisionManifest } from './manifest';
import type { ImageTransform } from './preprocess';
import type { VisionDetection, VisionOutputs } from './types';
import { imageBox, suppress } from './boxes';
import { tensorShape } from './tensor';

const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

export function decodeRfdetr(outputs: VisionOutputs, manifest: VisionManifest, transform: ImageTransform) {
  const { tensor: boxes, dims: boxShape } = tensorShape(outputs.pred_boxes, 2);
  const { tensor: logits, dims: logitShape } = tensorShape(outputs.pred_logits, 2);

  if (
    boxShape[1] !== 4 ||
    logitShape[1] !== manifest.classes.length ||
    boxShape[0] !== logitShape[0] ||
    boxShape[0] > 10000
  )
    throw new Error('The detector returned unsupported tensors.');

  const classes = manifest.classes.length;
  const candidates: { score: number; row: number; label: string }[] = [];

  for (let index = 0; index < logits.data.length; index++) {
    const score = sigmoid(Number(logits.data[index]));
    const label = manifest.classes[index % classes];

    if (label && score >= 0.25) candidates.push({ score, row: Math.floor(index / classes), label });
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 300)
    .map(({ score, row, label }) => {
      const [cx, cy, w, h] = Array.from({ length: 4 }, (_, n) => Number(boxes.data[row * 4 + n]));

      return {
        label,
        score,
        box: imageBox(
          [(cx - w / 2) * transform.width, (cy - h / 2) * transform.height, w * transform.width, h * transform.height],
          transform,
        ),
      };
    });
}

export function decodeYolo(outputs: VisionOutputs, manifest: VisionManifest, transform: ImageTransform) {
  const { tensor, dims } = tensorShape(Object.values(outputs)[0], 2);
  const channels = manifest.classes.length + 4;
  const count = dims[1];

  if (dims[0] !== channels || count > 10000 || !manifest.classes.length)
    throw new Error('The detector returned unsupported tensors.');

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
