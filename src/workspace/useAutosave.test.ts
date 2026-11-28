import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { finishAppearance } from '../appearance/model';
import { DEFAULT_PROJECT } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { sceneStore } from '../utils/sceneStore';
import type { SceneDraft } from './sceneDraft';
import { useAutosave } from './useAutosave';

const hooks = vi.hoisted(() => ({ refs: [] as Array<{ current: unknown }>, index: 0 }));

vi.mock('react', () => ({
  useRef: (value: unknown) => {
    const index = hooks.index++;

    hooks.refs[index] ??= { current: value };

    return hooks.refs[index];
  },
  useEffectEvent: (callback: unknown) => callback,
  useEffect: (effect: () => unknown) => effect(),
  useLayoutEffect: (effect: () => unknown) => effect(),
}));
vi.mock('../three/scenePreview', () => ({ scenePreview: vi.fn(async () => ({})) }));
vi.mock('../utils/aiHandoffClient', () => ({ handoffInWorker: vi.fn(async () => '{"brief":""}') }));
vi.mock('../utils/sceneJson', () => ({ sceneJson: vi.fn(async (value: unknown) => JSON.stringify(value)) }));
vi.mock('../utils/platformBridge', () => ({
  platformBridge: { saveSceneJson: vi.fn(), saveScenePreview: vi.fn() },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  hooks.refs = [];
  hooks.index = 0;
  vi.mocked(platformBridge.saveSceneJson).mockImplementation(async (json) => ({
    ...JSON.parse(json),
    partCount: 1,
    updatedAt: '2026-11-28',
  }));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  sceneStore.set([]);
});

const draft: SceneDraft = {
  sceneId: 'appearance',
  sceneName: 'Covers',
  globalGoal: '',
  parts: [
    {
      ...box('cover', [0, 20, 0], [40, 40, 40], 30),
      appearance: {
        ...finishAppearance('paint', '#888888'),
        mapping: { kind: 'planar', plane: 'xy', scale: 25, rotation: 0 },
      },
    },
  ],
  annotations: [],
  project: DEFAULT_PROJECT,
  chatId: null,
};

function Render(next: SceneDraft) {
  return useAutosave({ draft: next, active: true, pristine: false, unsaved: false });
}

function render(next: SceneDraft) {
  hooks.index = 0;

  return Render(next);
}

it.each(['parts', 'project', 'sceneName'] as const)(
  'saves the redone %s instead of the pending undo when it matches the last saved draft',
  async (field) => {
    const undone = {
      ...draft,
      [field]: {
        parts: [{ ...draft.parts[0], appearance: finishAppearance('paint', '#888888') }],
        project: { ...draft.project, budgetUsd: (draft.project.budgetUsd ?? 0) + 1 },
        sceneName: 'Previous name',
      }[field],
    };

    render(draft);
    render(undone);

    const autosave = render(draft);

    await autosave.flush();
    expect(platformBridge.saveSceneJson).toHaveBeenCalledOnce();
    expect(JSON.parse(vi.mocked(platformBridge.saveSceneJson).mock.calls[0][0])).toMatchObject({
      parts: draft.parts,
      project: draft.project,
      name: draft.sceneName,
    });
    await vi.advanceTimersByTimeAsync(1200);
    expect(platformBridge.saveSceneJson).toHaveBeenCalledOnce();
  },
);

it('keeps a redo behind an already started undo write', async () => {
  let release = () => {};
  let begin = () => {};
  const writing = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    begin = resolve;
  });
  const undone = { ...draft, parts: [{ ...draft.parts[0], color: '#123456' }] };

  vi.mocked(platformBridge.saveSceneJson).mockImplementationOnce(async (json) => {
    begin();
    await writing;

    return { ...JSON.parse(json), partCount: 1, updatedAt: '2026-11-28' };
  });
  render(draft);

  const first = render(undone).flush();

  await started;

  const second = render(draft).flush();

  release();
  await Promise.all([first, second]);
  expect(vi.mocked(platformBridge.saveSceneJson).mock.calls.map(([json]) => JSON.parse(json).parts)).toEqual([
    undone.parts,
    draft.parts,
  ]);
});
