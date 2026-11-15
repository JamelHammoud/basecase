import type { VisionResult } from '../../vision/types';
import type { SkeletonPoint } from './poseProtocol';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function poseVisionResult(points: SkeletonPoint[] | null, timestamp: number): VisionResult {
  const visible = (points ?? []).filter(([x, y, seen]) => seen && Number.isFinite(x) && Number.isFinite(y));
  const keypoints: [number, number][] = visible.map(([x, y]) => [clamp(x), clamp(y)]);
  const xs = keypoints.map(([x]) => x);
  const ys = keypoints.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return {
    modelId: 'mediapipe-pose',
    camera: 'operator',
    timestamp,
    width: 640,
    height: 480,
    detections: keypoints.length
      ? [{ label: 'person', score: 1, box: [x, y, Math.max(...xs) - x, Math.max(...ys) - y], keypoints }]
      : [],
  };
}
