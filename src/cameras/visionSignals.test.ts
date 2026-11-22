import { describe, expect, it } from 'vitest';
import { trackingSignalNames, visionSignalValues } from './visionSignals';
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

describe('tracking signals', () => {
  const tracked = {
    ...result,
    detections: [{ label: 'Block', score: 0.9, box: [0.1, 0.2, 0.1, 0.1] as [number, number, number, number] }],
    tracking: {
      tracks: [
        {
          id: 1,
          label: 'Block',
          score: 0.9,
          box: [0.1, 0.2, 0.1, 0.1],
          seenMs: 1,
          hits: 3,
          missed: 0,
          coasting: false,
        },
        { id: 2, label: 'Block', score: 0.8, box: [0.5, 0.2, 0.1, 0.1], seenMs: 0, hits: 4, missed: 2, coasting: true },
      ],
      zones: [{ name: 'Bin', count: 2, dwell: 1.5, ids: [1, 2] }],
      lines: [{ name: 'Gate', in: 3, out: 1, recent: [] }],
    },
  } as VisionResult;

  it('adds tracks, zone counts, dwell seconds and line crossings under the same camera and class names', () => {
    const values = visionSignalValues([tracked]);

    expect(values['vision.wrist.block']).toBe(1);
    expect(values['vision.wrist.block.tracks']).toBe(2);
    expect(values['vision.wrist.zone.bin.count']).toBe(2);
    expect(values['vision.wrist.zone.bin.dwell']).toBe(1.5);
    expect(values['vision.wrist.line.gate.in']).toBe(3);
    expect(values['vision.wrist.line.gate.out']).toBe(1);
  });

  it('adds nothing for a result without tracking', () => {
    expect(Object.keys(visionSignalValues([result])).filter((name) => /tracks|zone|line/u.test(name))).toEqual([]);
  });

  it('returns every tracking signal to zero once the class and the regions report nothing', () => {
    const empty = { ...tracked, detections: [], tracking: { tracks: [], zones: [], lines: [] } };
    const values = visionSignalValues(
      [empty],
      ['vision.wrist.block', 'vision.wrist.block.tracks', 'vision.wrist.zone.bin', 'vision.wrist.line.gate'],
    );

    expect(values).toMatchObject({
      'vision.wrist.block': 0,
      'vision.wrist.block.tracks': 0,
      'vision.wrist.zone.bin.count': 0,
      'vision.wrist.zone.bin.dwell': 0,
      'vision.wrist.line.gate.in': 0,
      'vision.wrist.line.gate.out': 0,
    });
    expect(values['vision.wrist.zone.bin.score']).toBeUndefined();
  });

  it('takes zone and line readings from the newest model on a camera', () => {
    const older = {
      ...tracked,
      modelId: 'older',
      timestamp: 1,
      tracking: { ...tracked.tracking!, lines: [{ name: 'Gate', in: 9, out: 9, recent: [] }] },
    };

    expect(visionSignalValues([older, tracked])['vision.wrist.line.gate.in']).toBe(3);
    expect(visionSignalValues([tracked, older])['vision.wrist.line.gate.in']).toBe(3);
  });

  it('names the tracking signals a result adds so they can fall back to zero', () => {
    expect(trackingSignalNames('wrist', tracked.tracking)).toEqual([
      'vision.wrist.block.tracks',
      'vision.wrist.zone.bin',
      'vision.wrist.line.gate',
    ]);
  });
});
