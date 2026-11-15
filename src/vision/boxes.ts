import type { ImageTransform } from './preprocess';
import type { VisionDetection } from './types';

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function imageBox(box: number[], transform: ImageTransform): VisionDetection['box'] {
  const x = clamp01((box[0] - transform.left) / transform.scaledWidth);
  const y = clamp01((box[1] - transform.top) / transform.scaledHeight);
  const right = clamp01((box[0] + box[2] - transform.left) / transform.scaledWidth);
  const bottom = clamp01((box[1] + box[3] - transform.top) / transform.scaledHeight);

  return [x, y, Math.max(0, right - x), Math.max(0, bottom - y)];
}

function overlap(a: VisionDetection, b: VisionDetection) {
  const [x, y, w, h] = a.box;
  const [bx, by, bw, bh] = b.box;
  const area =
    Math.max(0, Math.min(x + w, bx + bw) - Math.max(x, bx)) * Math.max(0, Math.min(y + h, by + bh) - Math.max(y, by));

  return area / Math.max(1e-12, w * h + bw * bh - area);
}

export function suppress(detections: VisionDetection[], threshold = 0.45) {
  const sorted = detections
    .filter((d) => Number.isFinite(d.score) && d.box.every(Number.isFinite))
    .sort((a, b) => b.score - a.score);
  const kept: VisionDetection[] = [];
  const byLabel = new Map<string, VisionDetection[]>();

  for (const item of sorted) {
    if (kept.length >= 300) break;

    const label = item.label;
    const peers = byLabel.get(label);

    if (peers?.some((other) => overlap(other, item) > threshold)) continue;

    kept.push(item);

    if (peers) peers.push(item);
    else byLabel.set(label, [item]);
  }

  return kept;
}
