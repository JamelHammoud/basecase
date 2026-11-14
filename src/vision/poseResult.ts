import type { SkeletonPoint } from '../cameras/operator/poseProtocol';
import type { VisionDetection, VisionResult } from './protocol';
import { keepVisionResult } from './resultStore';

interface ImageLandmark {
  x: number;
  y: number;
  visibility?: number;
}

type PoseMetadata = Pick<VisionResult, 'camera' | 'timestamp' | 'width' | 'height' | 'elapsedMs'>;

const unit = (value: number) => Math.max(0, Math.min(1, value));

function poseDetection(points: ImageLandmark[]): VisionDetection[] {
  const visible = points.filter((point) => Number.isFinite(point.x + point.y) && (point.visibility ?? 1) >= 0.5);

  if (visible.length < 2) return [];

  const xs = visible.map((point) => unit(point.x));
  const ys = visible.map((point) => unit(point.y));
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return [
    {
      classId: 0,
      label: 'person',
      score: visible.reduce((sum, point) => sum + unit(point.visibility ?? 1), 0) / visible.length,
      box: [x, y, Math.max(...xs) - x, Math.max(...ys) - y],
      keypoints: points.map((point) => ({
        x: Number.isFinite(point.x) ? unit(point.x) : 0,
        y: Number.isFinite(point.y) ? unit(point.y) : 0,
        score: Number.isFinite(point.x + point.y) ? unit(point.visibility ?? 1) : 0,
      })),
    },
  ];
}

export function poseVisionResult(points: ImageLandmark[], metadata: PoseMetadata): VisionResult {
  return { ...metadata, modelId: 'pose', kind: 'keypoints', detections: poseDetection(points) };
}

export function operatorPoseVision(points: SkeletonPoint[] | null, timestamp: number): void {
  keepVisionResult(
    poseVisionResult(
      (points ?? []).map(([x, y, visible]) => ({ x, y, visibility: visible ? 1 : 0 })),
      { camera: 'operator', timestamp, width: 640, height: 480, elapsedMs: 0 },
    ),
  );
}
