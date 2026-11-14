import { afterEach, describe, expect, it } from 'vitest';
import { operatorPoseVision, poseVisionResult } from './poseResult';
import { clearVisionResults, latestVision } from './resultStore';

afterEach(() => clearVisionResults());

describe('Body Pose camera results', () => {
  it('keeps all keypoints and bounds the visible body in source coordinates', () => {
    const result = poseVisionResult(
      [
        { x: 0.2, y: 0.1, visibility: 0.9 },
        { x: 0.8, y: 0.9, visibility: 0.8 },
        { x: -1, y: 2, visibility: 0.2 },
      ],
      { camera: 'wrist', timestamp: 120, width: 640, height: 480, elapsedMs: 4 },
    );

    expect(result).toMatchObject({ modelId: 'pose', kind: 'keypoints', camera: 'wrist', timestamp: 120 });
    expect(result.detections).toHaveLength(1);
    expect(result.detections?.[0].box[0]).toBeCloseTo(0.2);
    expect(result.detections?.[0].box[2]).toBeCloseTo(0.6);
    expect(result.detections?.[0].keypoints).toHaveLength(3);
  });

  it('publishes the camera input result without running another model and clears lost bodies', () => {
    operatorPoseVision(
      [
        [0.25, 0.2, true],
        [0.75, 0.8, true],
      ],
      200,
    );

    expect(latestVision('operator', 'pose')?.detections?.[0]).toMatchObject({ label: 'person', score: 1 });

    operatorPoseVision(null, 201);

    expect(latestVision('operator', 'pose')?.detections).toEqual([]);
  });

  it('refuses nonfinite and invisible landmarks as body evidence', () => {
    const result = poseVisionResult(
      [
        { x: Number.NaN, y: 0.2, visibility: 1 },
        { x: 0.3, y: 0.4, visibility: 0.1 },
      ],
      { camera: 'head', timestamp: 1, width: 20, height: 20, elapsedMs: 0 },
    );

    expect(result.detections).toEqual([]);
  });
});
