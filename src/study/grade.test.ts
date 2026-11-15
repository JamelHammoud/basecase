import { describe, expect, it } from 'vitest';
import { box, fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../types/robotics';
import { gradeStudyDetached } from './grade';
import { gradeStudy } from './study';
import type { StudyScene } from './types';

const sceneOf = (parts: StudyScene['parts']): StudyScene => ({
  parts,
  project: DEFAULT_PROJECT,
  measures: fixtureMeasures(parts),
  triangles: Object.fromEntries(parts.map((p) => [p.id, fixtureTriangles(parts)(p.id)!])),
});
const choices = { knobs: [], selection: [] };

describe('detached Study Checks', () => {
  it('measures intersecting geometry with the same fit blockers as Build', () => {
    const scene = sceneOf([box('first', [0, 10, 0], [20, 20, 20], 100), box('second', [5, 10, 0], [20, 20, 20], 100)]);
    const row = gradeStudyDetached(scene, choices);

    expect(row.checks.some((check) => check.status === 'fail')).toBe(true);
    expect(row.checks.find((check) => check.check === 'Fit')?.status).toBe('fail');
    expect(row.massG).toBe(200);
  });

  it('refuses missing meshes instead of presenting stale or unmeasured checks', () => {
    const scene = sceneOf([box('missing', [0, 10, 0], [20, 20, 20], 100)]);

    expect(() => gradeStudyDetached({ ...scene, triangles: {} }, choices)).toThrow('Load meshes');
  });

  it('shares the engineering battery runtime formula without parsing display text', () => {
    const servo = {
      ...box('servo', [0, 20, 0], [40, 40, 20], 55),
      kind: 'component' as const,
      componentId: 'feetech-sts3215',
      componentVariant: 'c001',
    };
    const pack = {
      ...box('pack', [50, 20, 0], [30, 20, 60], 100),
      kind: 'component' as const,
      componentId: 'ovonic-2s-2200-50c',
    };
    const row = gradeStudy(sceneOf([servo, pack]), choices);
    const avg = 0.15 + 2 / (7.4 * 0.9);

    expect(row.runtimeMinutes).toBeCloseTo(((0.8 * 2.2) / avg) * 60, 8);
    expect(gradeStudy(sceneOf([servo]), choices).runtimeMinutes).toBeUndefined();
  });
});
