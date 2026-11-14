import { describe, expect, it } from 'vitest';
import type { VisionResult } from '../../vision/protocol';
import { createSignalBus } from './signalBus';
import { signalRef } from './signalNames';
import { visionSignalValues } from './visionSignals';

const detection: VisionResult = {
  camera: 'scene',
  modelId: 'person-detection',
  kind: 'detect',
  timestamp: 100,
  elapsedMs: 10,
  width: 640,
  height: 480,
  detections: [
    { classId: 0, label: 'person', score: 0.6, box: [0.1, 0.2, 0.2, 0.3] },
    { classId: 0, label: 'person', score: 0.9, box: [0.5, 0.1, 0.3, 0.7] },
  ],
};

const scope = { declared: new Set<string>(), inputs: new Set<string>(), probes: new Set<string>() };

describe('vision console signals', () => {
  it('publishes counts and the best normalized box through the real bus', () => {
    const bus = createSignalBus();
    const vision = visionSignalValues([detection], 200);

    bus.push({
      time: 0.2,
      running: true,
      joints: [],
      robot: {},
      probes: {},
      inputs: {},
      goal: null,
      cameras: [],
      vision,
    });
    expect(bus.read('vision.scene.person')).toBe(2);
    expect(bus.read('vision.scene.person.count')).toBe(2);
    expect(bus.read('vision.scene.person.score')).toBeCloseTo(0.9);
    expect(bus.read('vision.scene.person.x')).toBe(0.5);
    expect(bus.read('vision.scene.person.height')).toBeCloseTo(0.7);
    expect(bus.expand('vision.scene.*.count')).toContain('vision.scene.person.count');
  });

  it('exposes slow detector results with their original timestamp until replaced or removed', () => {
    const values = visionSignalValues([{ ...detection, elapsedMs: 6000 }], 6100);

    expect(values['vision.scene.person.count']).toBe(2);
    expect(values['vision.scene.person.timestamp']).toBe(100);
    expect(values['vision.scene.person.ageMs']).toBe(6000);
    expect(
      visionSignalValues([{ ...detection, timestamp: 6200, detections: [] }], 6300)['vision.scene.person.count'],
    ).toBe(0);
    expect(visionSignalValues([], 6300)['vision.scene.person.count']).toBeUndefined();
    expect(signalRef(scope, ['number'])('vision.scene.person.ageMs', '')).toBe('vision.scene.person.ageMs');
  });

  it('zeros empty detections, supports explicit age limits and validates names for Case panels', () => {
    expect(visionSignalValues([{ ...detection, detections: [] }], 200)['vision.scene.person']).toBe(0);
    expect(visionSignalValues([detection], 1200, 1000)['vision.scene.person']).toBeUndefined();
    expect(signalRef(scope, ['number'])('vision.scene.person.count', '')).toBe('vision.scene.person.count');
    expect(() => signalRef(scope, ['number'])('vision.scene.person.unknown', '')).toThrow();
  });
});
