import { describe, expect, it } from 'vitest';
import { studyQuad } from '../sim/fixtures/studyQuad';
import { gradeStudy } from '../study/study';
import type { StudyKnob, StudyRecord } from '../study/types';
import { DEFAULT_PROJECT } from '../types/robotics';
import { studyKnobs } from './useStudy';

describe('Study configuration after a partial run', () => {
  it('keeps disabled choices available alongside the saved choices after reopening a scene', () => {
    const robot = studyQuad();
    const scene = { parts: robot.parts, project: DEFAULT_PROJECT, measures: {}, triangles: {} };
    const current = gradeStudy(scene, { knobs: [], selection: [] });
    const length: StudyKnob = { id: 'foot-length', kind: 'foot', values: [{ length: 1.1 }, { length: 1.2 }] };
    const study: StudyRecord = {
      knobs: [length],
      current,
      rows: [],
      total: 2,
      seed: 1,
      baseKey: current.sceneKey,
      base: scene,
    };
    const restored = studyKnobs(null, { ...DEFAULT_PROJECT, study }, robot.parts);

    expect(restored.find((knob) => knob.id === 'foot-length')).toEqual(length);
    expect(restored.find((knob) => knob.id === 'foot-width')?.values).toEqual([
      { width: 1 },
      { width: 1.25 },
      { width: 1.5 },
    ]);
    expect(studyKnobs(robot.knobs, { ...DEFAULT_PROJECT, study }, robot.parts)).toBe(robot.knobs);
  });
});
