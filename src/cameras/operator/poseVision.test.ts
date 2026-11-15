import { describe, expect, it } from 'vitest';
import { poseVisionResult } from './poseVision';

describe('operator pose vision', () => {
  it('publishes existing pose landmarks and bounds without running another estimator', () => {
    const result = poseVisionResult(
      [
        [0.2, 0.1, true],
        [0.8, 0.9, true],
        [1.5, -1, false],
      ],
      123,
    );

    expect(result).toMatchObject({ modelId: 'mediapipe-pose', camera: 'operator', timestamp: 123 });
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].box[0]).toBeCloseTo(0.2);
    expect(result.detections[0].box[1]).toBeCloseTo(0.1);
    expect(result.detections[0].box[2]).toBeCloseTo(0.6);
    expect(result.detections[0].box[3]).toBeCloseTo(0.8);
    expect(result.detections[0].keypoints).toEqual([
      [0.2, 0.1],
      [0.8, 0.9],
    ]);
    expect(poseVisionResult(null, 124).detections).toEqual([]);
  });
});
