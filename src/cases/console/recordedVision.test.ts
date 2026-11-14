import { describe, expect, it } from 'vitest';
import type { VisionResult } from '../../vision/protocol';
import { recordedBus } from './recordedSignals';
import { recordedVisionBus } from './recordedVision';

const result: VisionResult = {
  camera: 'front',
  mediaSource: 'try-a',
  modelId: 'object-detection',
  kind: 'detect',
  timestamp: 100,
  mediaTime: 1,
  width: 640,
  height: 480,
  elapsedMs: 10,
  detections: [{ classId: 41, label: 'cup', score: 0.9, box: [0.2, 0.3, 0.2, 0.4] }],
};

describe('recorded camera vision signals', () => {
  it('binds decoded results to the exact media playhead and preserves them when seeking', () => {
    const base = recordedBus({ t: [0, 1, 2], numbers: new Map([['robot.speed', [0, 1, 2]]]), labels: new Map() });
    const bus = recordedVisionBus(base, 'try-a');

    bus.see({ ...result, mediaSource: 'try-b' });
    bus.seek(1);
    expect(bus.read('vision.front.cup')).toBeUndefined();
    bus.seek(0);
    bus.see(result);
    expect(bus.read('vision.front.cup')).toBeUndefined();
    bus.seek(1);
    expect(bus.read('vision.front.cup')).toBe(1);
    expect(bus.read('robot.speed')).toBe(1);
    expect(bus.expand('vision.front.*.count')).toContain('vision.front.cup.count');
    expect(bus.series('vision.front.cup').v[1]).toBe(1);
    bus.seek(2);
    expect(bus.read('vision.front.cup')).toBeUndefined();
    bus.seek(1);
    expect(bus.read('vision.front.cup')).toBe(1);
  });
});
