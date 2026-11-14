import { describe, expect, it } from 'vitest';
import { RoutineVision } from './routineVision';
import type { VisionResult } from '../vision/protocol';

const result = (over: Partial<VisionResult> = {}): VisionResult => ({
  camera: 'scene',
  modelId: 'person-detection',
  kind: 'detect',
  timestamp: 100,
  elapsedMs: 12,
  width: 640,
  height: 480,
  detections: [{ classId: 0, label: 'person', score: 0.9, box: [0.1, 0.2, 0.3, 0.4] }],
  ...over,
});

describe('Routine vision mailbox', () => {
  it('reads real detector counts and boolean outputs, without inventing missing values', () => {
    const vision = new RoutineVision();

    expect(vision.read('person-detection', 'boolean', 100)).toBeUndefined();
    vision.push(result());
    expect(vision.read('person-detection', 'boolean', 200)).toEqual({ num: 1, at: 100 });
    expect(vision.read('person-detection', 'detections', 200)).toEqual({ num: 1, at: 100 });
    expect(vision.read('object-detection', 'boolean', 200)).toBeUndefined();
    expect(vision.read('person-detection', 'boolean', 1200, { maxAgeMs: 1000 })).toBeUndefined();
  });

  it('detects uniform nearby walls in metric depth and leaves relative depth unknown', () => {
    const vision = new RoutineVision();
    const near = { width: 10, height: 10, units: 'meters' as const, values: new Float32Array(100).fill(0.5) };

    vision.push(result({ modelId: 'obstacle-near', kind: 'depth', detections: undefined, depth: near }));
    expect(vision.read('obstacle-near', 'boolean', 100)?.num).toBe(1);
    expect(vision.read('obstacle-near', 'number', 100)?.num).toBeCloseTo(0.5);
    vision.push(
      result({
        modelId: 'obstacle-near',
        kind: 'depth',
        timestamp: 200,
        depth: { ...near, values: new Float32Array(100).fill(2) },
      }),
    );
    expect(vision.read('obstacle-near', 'boolean', 200)?.num).toBe(0);
    vision.push(
      result({ modelId: 'obstacle-near', kind: 'depth', timestamp: 300, depth: { ...near, units: 'relative' } }),
    );
    expect(vision.read('obstacle-near', 'boolean', 300)).toBeUndefined();
  });

  it('preserves slow model frame age and respects the caller’s freshness window', () => {
    const vision = new RoutineVision();

    vision.push(result({ timestamp: 100 }));
    expect(vision.read('person-detection', 'boolean', 5100, { maxAgeMs: 6000 })).toEqual({ num: 1, at: 100 });
    expect(vision.read('person-detection', 'boolean', 5100, { maxAgeMs: 1000 })).toBeUndefined();
  });

  it('selects a camera and class without counting unrelated detections', () => {
    const vision = new RoutineVision();

    vision.push(
      result({
        modelId: 'object-detection',
        detections: [{ classId: 1, label: 'bottle', score: 0.9, box: [0, 0, 1, 1] }],
      }),
    );
    expect(vision.read('object-detection', 'boolean', 100, { camera: 'scene', className: 'cup' })?.num).toBe(0);
    expect(vision.read('object-detection', 'boolean', 100, { camera: 'front' })).toBeUndefined();
    vision.push(
      result({
        camera: 'front',
        modelId: 'object-detection',
        detections: [{ classId: 2, label: 'cup', score: 0.9, box: [0, 0, 1, 1] }],
      }),
    );
    expect(vision.read('object-detection', 'boolean', 100, { camera: 'front', className: 'cup' })?.num).toBe(1);
  });

  it('ignores an old result and distinguishes an empty frame from missing inference', () => {
    const vision = new RoutineVision();

    vision.push(result());
    vision.push(result({ timestamp: 50, detections: [] }));
    expect(vision.read('person-detection', 'boolean', 200)?.num).toBe(1);
    vision.push(result({ timestamp: 300, detections: [] }));
    expect(vision.read('person-detection', 'boolean', 300)).toEqual({ num: 0, at: 300 });
  });
});
