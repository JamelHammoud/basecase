import { describe, expect, it, vi } from 'vitest';
import { bracketAndServo } from '../agent/fixtures/tunedBracket';
import type { StudyRecord, StudyRow } from '../study/types';
import { DEFAULT_PROJECT } from '../types/robotics';
import { draftChanged, type SceneDraft } from '../workspace/sceneDraft';
import { sceneJson } from './sceneJson';

const row: StudyRow = {
  key: '0',
  sceneKey: 'base',
  selection: [0],
  label: 'wall 2',
  checks: [],
  costUsd: 20,
  massG: 10,
  metrics: { massG: 10, torque: 'pass' },
};

function fixture() {
  const parts = bracketAndServo();
  const study: StudyRecord = {
    knobs: [{ id: 'wall', kind: 'dimension', part: 'bracket', name: 'wall', values: [2, 3] }],
    rows: [row],
    current: row,
    total: 2,
    seed: 1,
    baseKey: 'base',
    base: { parts, project: DEFAULT_PROJECT },
  };
  const draft: SceneDraft = {
    sceneId: 'study',
    sceneName: 'Bracket',
    globalGoal: '',
    chatId: null,
    parts,
    annotations: [],
    project: { ...DEFAULT_PROJECT, study },
  };

  return { draft, study, parts };
}

describe('saving a running Study', () => {
  it('writes a complete baseline once and preserves it as each result arrives', async () => {
    const { draft, study, parts } = fixture();
    const stringify = vi.spyOn(JSON, 'stringify');
    const first = await sceneJson({ ...draft });
    const progressed = {
      ...draft,
      project: { ...draft.project, study: { ...study, rows: [row, { ...row, key: '1', selection: [1] }] } },
    };
    const second = await sceneJson({ ...progressed });
    const partWrites = stringify.mock.calls.filter(([value]) => parts.includes(value as (typeof parts)[number]));
    const rowWrites = stringify.mock.calls.filter(([value]) =>
      progressed.project.study.rows.includes(value as StudyRow),
    );
    const knobWrites = stringify.mock.calls.filter(([value]) => value === study.knobs);

    stringify.mockRestore();
    expect(partWrites).toHaveLength(parts.length);
    expect(rowWrites).toHaveLength(2);
    expect(knobWrites).toHaveLength(1);
    expect(JSON.parse(first).project.study).toEqual(study);
    expect(JSON.parse(second).project.study.base).toEqual(study.base);
    expect(JSON.parse(second).project.study.rows).toHaveLength(2);
    expect(draftChanged(draft, progressed)).toBe(true);
    expect(draftChanged(draft, { ...draft, project: { ...draft.project } })).toBe(false);
    expect(draftChanged(draft, { ...draft, project: { ...draft.project, infillPct: 30 } })).toBe(true);
  });
});
