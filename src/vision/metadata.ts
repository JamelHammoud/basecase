import type { VisionResult } from './types';

function depthNearness(depth: NonNullable<VisionResult['depth']>) {
  const values = depth.values;

  if (!values?.length) return depth.nearness ?? 0;

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;

  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  for (let y = Math.floor(depth.height * 0.25); y < Math.ceil(depth.height * 0.75); y++) {
    for (let x = Math.floor(depth.width * 0.25); x < Math.ceil(depth.width * 0.75); x++) {
      sum += values[y * depth.width + x];
      count++;
    }
  }

  return max > min && count > 0 ? (sum / count - min) / (max - min) : 0;
}

export function visionMetadata(result: VisionResult): VisionResult {
  const depth = result.depth;
  const detections = result.detections.map(({ mask, ...item }) => {
    void mask;

    return item;
  });

  if (!depth) return { ...result, detections };

  return {
    ...result,
    detections,
    depth: { width: depth.width, height: depth.height, relative: true, nearness: depthNearness(depth) },
  };
}
