import { describe, expect, it } from 'vitest';
import { compileRoutine } from './compile';
import { FIXTURE_SKILLS } from './fixtureSkills';
import { greetingRoutine } from './greeting';
import { routineVisionModels, visionFact } from './vision';
import type { VisionResult } from '../vision/types';

const result: VisionResult = {
  modelId: 'yolo11n',
  camera: 'front',
  timestamp: 100,
  width: 640,
  height: 480,
  detections: [
    { label: 'cup', score: 0.9, box: [0.1, 0.1, 0.2, 0.3] },
    { label: 'person', score: 0.8, box: [0.4, 0.1, 0.3, 0.8] },
  ],
};

describe('Routine vision facts', () => {
  it('reduces a confident top classification to a labelled observation without boxes', () => {
    const classified = {
      ...result,
      detections: [],
      classes: [
        { label: 'cup', score: 0.9 },
        { label: 'person', score: 0.1 },
      ],
    };

    expect(visionFact(classified, { model: 'object-detection', type: 'boolean', label: 'cup' }).num).toBe(1);
    expect(visionFact(classified, { model: 'person-detection', type: 'boolean' }).num).toBe(0);
    expect(
      visionFact(
        { ...classified, classes: [{ label: 'cup', score: 0.4 }] },
        { model: 'object-detection', type: 'boolean' },
      ).num,
    ).toBe(0);
  });

  it('uses detections for object, person and face facts without inventing a result', () => {
    expect(visionFact(result, { model: 'person-detection', type: 'boolean' })).toEqual({ num: 1, name: null });
    expect(visionFact(result, { model: 'object-detection', type: 'detections' })).toEqual({ num: 2, name: null });
    expect(visionFact(result, { model: 'object-detection', type: 'boolean', label: 'cup' }).num).toBe(1);
    expect(visionFact(result, { model: 'object-detection', type: 'boolean', label: 'dog' }).num).toBe(0);
    expect(visionFact({ ...result, detections: [] }, { model: 'person-detection', type: 'boolean' }).num).toBe(0);
    expect(visionFact({ ...result, detections: [] }, { model: 'face-detection', type: 'boolean' }).num).toBe(0);
  });

  it('keeps relative depth explicit and refuses a depth fact without depth pixels', () => {
    expect(() => visionFact(result, { model: 'obstacle-near', type: 'boolean' })).toThrow('depth');

    const depth = { nearness: 0.9, width: 2, height: 2, relative: true as const };

    expect(visionFact({ ...result, depth }, { model: 'obstacle-near', type: 'boolean' }).num).toBe(1);
    expect(visionFact({ ...result, depth }, { model: 'obstacle-near', type: 'number' }).num).toBeGreaterThan(0);
  });

  it('lists every detector a compiled plan actually uses', () => {
    const compiled = compileRoutine(greetingRoutine(), { skills: FIXTURE_SKILLS });

    expect(compiled.ok).toBe(true);
    expect(routineVisionModels(compiled.plan!)).toEqual(['depth-anything-v2-small', 'yolo11n', 'face-recognition']);
  });

  it('names the blocked infer node and watcher when a model cannot load', () => {
    const compiled = compileRoutine(greetingRoutine(), {
      skills: FIXTURE_SKILLS,
      unavailableModels: ['person-detection', 'face-recognition'],
    });

    expect(compiled.ok).toBe(false);
    expect(compiled.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'model-unavailable',
          path: 'person',
          message: expect.stringContaining('See Person'),
        }),
        expect.objectContaining({
          code: 'model-unavailable',
          path: 'recognize',
          message: expect.stringContaining('Check Face'),
        }),
      ]),
    );
  });
});
