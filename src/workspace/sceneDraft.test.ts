import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { draftChanged, type SceneDraft } from './sceneDraft';

const part = { id: 'a', kind: 'box' } as ScenePart;
const draft: SceneDraft = {
  sceneId: 's',
  sceneName: 'Arm',
  globalGoal: '',
  parts: [part],
  annotations: [],
  project: { ...DEFAULT_PROJECT },
  chatId: null,
};

describe('autosave change detection', () => {
  it('ignores re-created containers that hold the same parts and settings', () => {
    expect(draftChanged(draft, { ...draft, parts: [part], annotations: [], project: { ...draft.project } })).toBe(
      false,
    );
  });

  it('sees edits to parts, names, settings and the linked chat', () => {
    expect(draftChanged(draft, { ...draft, parts: [{ ...part }] })).toBe(true);
    expect(draftChanged(draft, { ...draft, sceneName: 'Arm 2' })).toBe(true);
    expect(draftChanged(draft, { ...draft, project: { ...draft.project, budgetUsd: 10 } })).toBe(true);
    expect(draftChanged(draft, { ...draft, chatId: 'chat-1' })).toBe(true);
  });
});
