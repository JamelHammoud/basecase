import { describe, expect, it } from 'vitest';
import { visionSignalValues } from './visionSignals';
import type { VisionResult } from '../vision/types';

const result = {
  modelId: 'objects',
  camera: 'wrist',
  timestamp: 123,
  width: 640,
  height: 480,
  detections: [
    { label: 'Block', score: 0.7, box: [0.1, 0.2, 0.3, 0.4] },
    { label: 'Block', score: 0.9, box: [0.2, 0.3, 0.4, 0.5] },
  ],
} as VisionResult;

describe('camera vision signals', () => {
  it('publishes class counts and highest-scoring normalized box without frame pixels', () => {
    expect(visionSignalValues([result])).toEqual({
      'vision.wrist.block': 2,
      'vision.wrist.block.score': 0.9,
      'vision.wrist.block.x': 0.2,
      'vision.wrist.block.y': 0.3,
      'vision.wrist.block.width': 0.4,
      'vision.wrist.block.height': 0.5,
    });
  });

  it('uses the strongest model for each class instead of counting duplicate detections twice', () => {
    const weaker = {
      ...result,
      modelId: 'other',
      detections: [{ label: 'Block', score: 0.8, box: [0, 0, 1, 1] as [number, number, number, number] }],
    };

    expect(visionSignalValues([result, weaker])['vision.wrist.block']).toBe(2);
    expect(visionSignalValues([result, weaker])['vision.wrist.block.score']).toBeCloseTo(0.9);
  });

  it('resets known classes after a camera sees no objects', () => {
    expect(visionSignalValues([{ ...result, detections: [] }], ['vision.wrist.block'])).toEqual({
      'vision.wrist.block': 0,
      'vision.wrist.block.score': 0,
      'vision.wrist.block.x': 0,
      'vision.wrist.block.y': 0,
      'vision.wrist.block.width': 0,
      'vision.wrist.block.height': 0,
    });
  });
});
