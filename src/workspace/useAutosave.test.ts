import { useEffectEvent } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { finishAppearance } from '../appearance/model';
import { box } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { sceneStore } from '../utils/sceneStore';
import type { SceneDraft } from './sceneDraft';
import { useAutosave } from './useAutosave';

vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: vi.fn(),
  useLayoutEffect: vi.fn(),
  useEffectEvent: vi.fn((callback) => callback),
}));
vi.mock('../three/scenePreview', () => ({ scenePreview: async () => ({}) }));
vi.mock('../utils/aiHandoffClient', () => ({ handoffInWorker: async () => null }));
vi.mock('../utils/platformBridge', () => ({
  platformBridge: { saveSceneJson: vi.fn(), saveScenePreview: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.mocked(platformBridge.saveSceneJson).mockImplementation(async (json) => ({
    ...JSON.parse(json),
    partCount: 1,
    updatedAt: '2026-11-28',
  }));
  vi.mocked(platformBridge.saveScenePreview).mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sceneStore.set([]);
});

const guide = (id: string) => ({ id, fingerprint: id }) as ProjectSettings['buildGuide'];

function Session(temporary = true) {
  const draft: SceneDraft = {
    sceneId: 'rover',
    sceneName: 'Rover',
    globalGoal: '',
    parts: [box('chassis', [0, 0, 0], [100, 20, 100], 100)],
    annotations: [],
    project: DEFAULT_PROJECT,
    chatId: null,
  };
  const firstEvent = vi.mocked(useEffectEvent).mock.calls.length;
  const autosave = useAutosave({ draft, active: true, pristine: false, unsaved: false, temporary });
  const onDraft = vi.mocked(useEffectEvent).mock.calls[firstEvent][0] as (next: SceneDraft, pristine: boolean) => void;

  return { draft, autosave, onDraft };
}

it('retains temporary persistence across reopening until an authored edit', async () => {
  const first = Session();

  first.onDraft({ ...first.draft, project: { ...first.draft.project, buildGuide: guide('automatic') } }, false);
  await first.autosave.flush();
  expect(first.autosave.isTemporary()).toBe(true);

  const reopened = Session(first.autosave.isTemporary());
  const generated = { ...reopened.draft, project: { ...reopened.draft.project, buildGuide: guide('regenerated') } };

  reopened.onDraft(generated, false);
  await reopened.autosave.flush();
  expect(platformBridge.saveSceneJson).not.toHaveBeenCalled();
  reopened.onDraft({ ...generated, sceneName: 'My rover' }, false);
  expect(reopened.autosave.isTemporary()).toBe(false);
  await reopened.autosave.flush();
  expect(platformBridge.saveSceneJson).toHaveBeenCalledTimes(1);

  const saved = Session(reopened.autosave.isTemporary());

  saved.onDraft({ ...saved.draft, project: { ...saved.draft.project, buildGuide: guide('later') } }, false);
  await saved.autosave.flush();
  expect(platformBridge.saveSceneJson).toHaveBeenCalledTimes(2);
});

it('keeps the first-launch scene unsaved through generated guides, then saves edits and subsequent guides', async () => {
  const { draft, autosave, onDraft } = Session();
  const generated = { ...draft, project: { ...draft.project, buildGuide: guide('automatic') } };

  onDraft(generated, false);
  expect(vi.getTimerCount()).toBe(0);
  await autosave.flush();
  expect(platformBridge.saveSceneJson).not.toHaveBeenCalled();

  const edited: SceneDraft = { ...generated, project: { ...generated.project, material: 'ABS' } };

  onDraft(edited, false);
  await autosave.flush();
  expect(platformBridge.saveSceneJson).toHaveBeenCalledTimes(1);
  expect(JSON.parse(vi.mocked(platformBridge.saveSceneJson).mock.calls[0][0]).project).toMatchObject({
    material: 'ABS',
    buildGuide: guide('automatic'),
  });
  onDraft({ ...edited, project: { ...edited.project, buildGuide: guide('updated') } }, false);
  await autosave.flush();
  expect(platformBridge.saveSceneJson).toHaveBeenCalledTimes(2);
});

it.each(['sceneName', 'parts', 'globalGoal', 'chatId', 'history'] as const)(
  'saves an authored %s change even when a guide finishes at the same time',
  async (field) => {
    const { draft, autosave, onDraft } = Session();
    const edits = {
      sceneName: 'Edited rover',
      parts: draft.parts.map((part) => ({ ...part, name: 'Edited chassis' })),
      globalGoal: 'Reach the flag',
      chatId: 'chat-a',
      history: 'checkpoint-a',
    };

    onDraft({ ...draft, [field]: edits[field], project: { ...draft.project, buildGuide: guide('automatic') } }, false);
    await autosave.flush();
    expect(platformBridge.saveSceneJson).toHaveBeenCalledTimes(1);

    const savedKey = field === 'sceneName' ? 'name' : field;
    const expected = field === 'history' ? undefined : edits[field];

    expect(JSON.parse(vi.mocked(platformBridge.saveSceneJson).mock.calls[0][0])[savedKey]).toEqual(expected);
  },
);

it('persists generated guides for an ordinary saved scene', async () => {
  const { draft, autosave, onDraft } = Session(false);

  onDraft({ ...draft, project: { ...draft.project, buildGuide: guide('automatic') } }, false);
  await autosave.flush();
  expect(platformBridge.saveSceneJson).toHaveBeenCalledTimes(1);
});

it('ends temporary-scene handling when another scene is loaded into the workspace', async () => {
  const { draft, autosave, onDraft } = Session();
  const loaded = { ...draft, sceneId: 'saved-rover' };

  onDraft(loaded, false);
  onDraft({ ...loaded, project: { ...loaded.project, buildGuide: guide('automatic') } }, false);
  await autosave.flush();
  expect(platformBridge.saveSceneJson).toHaveBeenCalledTimes(1);
  expect(JSON.parse(vi.mocked(platformBridge.saveSceneJson).mock.calls[0][0]).id).toBe('saved-rover');
});

function AppearanceSession() {
  const appearance = finishAppearance('paint', '#888888');
  const part = {
    ...box('cover', [0, 20, 0], [40, 40, 40], 30),
    appearance: { ...appearance, mapping: { ...appearance.mapping, scale: 25 } },
  };
  const saved: SceneDraft = {
    sceneId: 'appearance-robot',
    sceneName: 'Textured cover',
    globalGoal: '',
    parts: [part],
    annotations: [],
    project: DEFAULT_PROJECT,
    chatId: null,
  };
  const undo = {
    ...saved,
    parts: [{ ...part, appearance: { ...part.appearance, mapping: { ...part.appearance.mapping, scale: 10 } } }],
  };
  const firstEvent = vi.mocked(useEffectEvent).mock.calls.length;
  const autosave = useAutosave({ draft: saved, active: false, pristine: false, unsaved: false, temporary: false });
  const change = vi.mocked(useEffectEvent).mock.calls[firstEvent][0] as (next: SceneDraft, pristine: boolean) => void;

  return { saved, undo, autosave, change };
}

it.each(['flush', 'timer'] as const)(
  'saves Redo after Undo returns to the saved design through %s',
  async (delivery) => {
    const { saved, undo, autosave, change } = AppearanceSession();

    change(undo, false);
    change(saved, false);

    if (delivery === 'flush') await autosave.flush();
    else await vi.runAllTimersAsync();

    expect(platformBridge.saveSceneJson).toHaveBeenCalledOnce();
    expect(JSON.parse(vi.mocked(platformBridge.saveSceneJson).mock.calls[0][0]).parts).toEqual(saved.parts);
  },
);

it('keeps the pending save deadline when equivalent draft containers render again', async () => {
  const { undo, change } = AppearanceSession();

  change(undo, false);
  await vi.advanceTimersByTimeAsync(600);
  change({ ...undo, parts: [...undo.parts], project: { ...undo.project } }, false);
  await vi.advanceTimersByTimeAsync(600);
  expect(platformBridge.saveSceneJson).toHaveBeenCalledOnce();
  expect(JSON.parse(vi.mocked(platformBridge.saveSceneJson).mock.calls[0][0]).parts).toEqual(undo.parts);
});

it('retains the latest design when Undo and Redo occur during an earlier save', async () => {
  const { saved, undo, autosave, change } = AppearanceSession();
  let startSave = () => {};
  let releaseSave = () => {};
  const started = new Promise<void>((resolve) => {
    startSave = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });

  vi.mocked(platformBridge.saveSceneJson).mockImplementationOnce(async (json) => {
    const record = JSON.parse(json);

    startSave();
    await release;

    return { ...record, partCount: record.parts.length, updatedAt: '2026-11-28' };
  });
  change(undo, false);

  const first = autosave.flush();

  await started;
  change(saved, false);
  change(undo, false);

  const final = autosave.flush();

  releaseSave();
  await Promise.all([first, final]);
  expect(platformBridge.saveSceneJson).toHaveBeenCalledTimes(2);
  expect(vi.mocked(platformBridge.saveSceneJson).mock.calls.map(([json]) => JSON.parse(json).parts)).toEqual([
    undo.parts,
    undo.parts,
  ]);
});
