import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearVisionResults, keepVisionResult, latestVision, onVisionResults, visionResults } from './resultStore';
import type { VisionResult } from './protocol';

const result = (camera: string, modelId: string, timestamp: number): VisionResult => ({
  camera,
  modelId,
  timestamp,
  kind: 'detect',
  width: 320,
  height: 240,
  elapsedMs: 4,
  detections: [{ classId: 0, label: 'cup', score: 0.9, box: [0.1, 0.2, 0.3, 0.4] }],
});

beforeEach(() => clearVisionResults());

describe('camera vision results', () => {
  it('keeps the newest frame per model and camera and drops late inference', () => {
    const changed = vi.fn();
    const stop = onVisionResults(changed);

    keepVisionResult(result('wrist', 'detector', 20));
    keepVisionResult(result('scene', 'detector', 30));
    keepVisionResult(result('wrist', 'pose', 25));
    keepVisionResult(result('wrist', 'detector', 10));
    expect(visionResults()).toHaveLength(3);
    expect(latestVision('wrist')?.timestamp).toBe(25);
    expect(latestVision('wrist', 'detector')?.timestamp).toBe(20);
    expect(changed).toHaveBeenCalledTimes(3);
    stop();
  });
});
