import type { VisionResult } from './protocol';

type Depth = NonNullable<VisionResult['depth']>;

export function centralDepthMeters(depth: Depth): number | undefined {
  if (depth.units !== 'meters' || depth.values.length !== depth.width * depth.height) return undefined;

  const center: number[] = [];

  for (let y = Math.floor(depth.height * 0.25); y < Math.ceil(depth.height * 0.75); y++) {
    for (let x = Math.floor(depth.width * 0.25); x < Math.ceil(depth.width * 0.75); x++) {
      const value = depth.values[y * depth.width + x];

      if (!Number.isFinite(value) || value <= 0) return undefined;

      center.push(value);
    }
  }

  center.sort((a, b) => a - b);

  return center[Math.floor(center.length * 0.1)];
}

export function compactDepth(depth: VisionResult['depth']): VisionResult['depth'] {
  if (!depth) return depth;

  const centerMeters = depth.centerMeters ?? centralDepthMeters(depth);

  if (depth.width <= 16 && depth.height <= 16) return { ...depth, centerMeters };

  const width = Math.min(16, depth.width);
  const height = Math.min(16, depth.height);
  const values = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(depth.width - 1, Math.floor(((x + 0.5) * depth.width) / width));
      const sourceY = Math.min(depth.height - 1, Math.floor(((y + 0.5) * depth.height) / height));

      values[y * width + x] = depth.values[sourceY * depth.width + sourceX];
    }
  }

  return { width, height, values, units: depth.units, centerMeters };
}
