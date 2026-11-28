import { useEffectEvent } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_PROJECT } from '../types/robotics';
import { box } from '../sim/fixtures/parts';
import { finishAppearance } from '../appearance/model';
import { platformBridge } from '../utils/platformBridge';
import { sceneStore } from '../utils/sceneStore';
import { useAutosave } from './useAutosave';
import type { SceneDraft } from './sceneDraft';

vi.mock('react', () => ({
  useEffect: vi.fn(),
  useLayoutEffect: vi.fn(),
  useEffectEvent: vi.fn((callback) => callback),
  useRef: (current: unknown) => ({ current }),
}));
vi.mock('../utils/platformBridge', () => ({
  platformBridge: { saveSceneJson: vi.fn(), saveScenePreview: vi.fn() },
}));
vi.mock('../three/scenePreview', () => ({ scenePreview: vi.fn().mockResolvedValue({}) }));
vi.mock('../utils/aiHandoffClient', () => ({ handoffInWorker: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.mocked(platformBridge.saveSceneJson).mockImplementation(async (json) => {
    const record = JSON.parse(json);

    return { ...record, partCount: record.parts.length, updatedAt: '2026-11-28' };
  });
  vi.mocked(platformBridge.saveScenePreview).mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sceneStore.set([]);
});

function Session() {
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
  const autosave = useAutosave({ draft: saved, active: false, pristine: false, unsaved: false });
  const change = vi.mocked(useEffectEvent).mock.calls[0][0] as (next: SceneDraft, pristine: boolean) => void;

  return { saved, undo, autosave, change };
}

it.each(['flush', 'timer'] as const)(
  'saves Redo after Undo returns to the saved design through %s',
  async (delivery) => {
    const { saved, undo, autosave, change } = Session();

    change(undo, false);
    change(saved, false);

    if (delivery === 'flush') await autosave.flush();
    else await vi.runAllTimersAsync();

    expect(platformBridge.saveSceneJson).toHaveBeenCalledOnce();
    expect(JSON.parse(vi.mocked(platformBridge.saveSceneJson).mock.calls[0][0]).parts).toEqual(saved.parts);
  },
);

it('keeps the pending save deadline when equivalent draft containers render again', async () => {
  const { undo, change } = Session();

  change(undo, false);
  await vi.advanceTimersByTimeAsync(600);
  change({ ...undo, parts: [...undo.parts], project: { ...undo.project } }, false);
  await vi.advanceTimersByTimeAsync(600);
  expect(platformBridge.saveSceneJson).toHaveBeenCalledOnce();
  expect(JSON.parse(vi.mocked(platformBridge.saveSceneJson).mock.calls[0][0]).parts).toEqual(undo.parts);
});

it('retains the latest design when Undo and Redo occur during an earlier save', async () => {
  const { saved, undo, autosave, change } = Session();
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
