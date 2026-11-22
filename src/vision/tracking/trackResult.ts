import type { VisionResult } from '../types';
import type { TrackingSession } from './session';
import type { CameraRegions } from './types';

export function trackResult(
  session: TrackingSession,
  key: string,
  regions: CameraRegions | undefined,
  result: VisionResult,
): VisionResult {
  if (result.depth || result.classes) return result;

  session.configure(key, regions);

  return { ...result, tracking: session.update(key, result.detections, result.timestamp) };
}
