import { describe, expect, it } from 'vitest';
import type { TrainingFrame } from '../vision/frameSet';
import { labelGeometry } from '../vision/labelEdits';
import { maskFrameLabel } from './frameLabelGeometry';

describe('refining frame masks', () => {
  it('keeps known keypoints in the refined frame and leaves later frames without guessed keypoints', async () => {
    const label = labelGeometry({
      width: 4,
      height: 4,
      instance: 'cup',
      classId: 0,
      box: [0, 0, 4, 4],
      keypoints: [{ name: 'handle', x: 1, y: 2, visible: true }],
    });
    const frame: TrainingFrame = {
      id: 'first',
      width: 4,
      height: 4,
      camera: 'front',
      seed: 0,
      jpeg: new Uint8Array(),
      depth: new Float32Array(16),
      annotations: [label],
    };
    const refined = await maskFrameLabel(frame, label.mask, label);
    const tracked = await maskFrameLabel({ ...frame, id: 'second', annotations: [] }, label.mask, label);

    expect(refined.keypoints).toEqual(label.keypoints);
    expect(tracked.keypoints).toEqual([]);
  });
});
