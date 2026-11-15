import type { ImageAnnotation, TrainingFrame } from '../frameSet';
import { decodeMask } from '../imageMasks';
import type { VisionDetection } from '../types';
import { nearestMaskColumns } from '../maskSampling';

function boxOverlap(a: number[], b: number[]): number {
  const intersection =
    Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) *
    Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const union = a[2] * a[3] + b[2] * b[3] - intersection;

  return union > 0 ? intersection / union : 0;
}

function maskOverlap(truth: Uint8Array, mask: NonNullable<VisionDetection['mask']>, frame: TrainingFrame): number {
  const columns = nearestMaskColumns(mask.width, frame.width);
  let intersection = 0;
  let union = 0;

  for (let y = 0; y < frame.height; y++) {
    const py = Math.min(mask.height - 1, Math.floor(((y + 0.5) * mask.height) / frame.height));

    for (let x = 0; x < frame.width; x++) {
      const expected = truth[y * frame.width + x] !== 0;
      const actual = mask.values[py * mask.width + columns[x]] !== 0;

      intersection += Number(expected && actual);
      union += Number(expected || actual);
    }
  }

  return union > 0 ? intersection / union : 0;
}

export function annotationOverlap(annotation: ImageAnnotation, frame: TrainingFrame, segment: boolean) {
  if (!segment) {
    const box = annotation.box.map((v, i) => v / (i % 2 === 0 ? frame.width : frame.height));

    return (detection: VisionDetection) => boxOverlap(box, detection.box);
  }

  let truth: Uint8Array | null = null;

  return (detection: VisionDetection) => {
    if (!detection.mask) return 0;

    truth ??= decodeMask(annotation.mask);

    return maskOverlap(truth, detection.mask, frame);
  };
}
