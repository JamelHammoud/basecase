import { centralDepthMeters } from '../vision/depth';
import type { VisionResult } from '../vision/protocol';

export { compactDepth } from '../vision/depth';
export const OBSTACLE_DISTANCE_M = 0.75;

export function obstacleDistance(depth: VisionResult['depth']): number | undefined {
  if (!depth || depth.units !== 'meters') return undefined;

  const distance = depth.centerMeters ?? centralDepthMeters(depth);

  return distance !== undefined && Number.isFinite(distance) && distance > 0 ? distance : undefined;
}
