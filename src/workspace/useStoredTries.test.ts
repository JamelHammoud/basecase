import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { keepTries } from '../cases/tryStore';
import type { TryRecord } from '../cases/tries';
import type { Recording } from '../sim/recorder';
import type { Simulation } from '../sim/useSimulation';
import { DEFAULT_PROJECT } from '../types/robotics';
import { useStoredTries } from './useStoredTries';

const latest = vi.hoisted(() => ({ current: 'original-scene' }));

vi.mock('../utils/useLatestRef', () => ({ useLatestRef: () => latest }));
vi.mock('../cases/tryStore', () => ({
  useTries: () => [],
  keepTries: vi.fn(),
  deleteTries: vi.fn(),
  legacyRecordings: { get: vi.fn(), delete: vi.fn() },
}));

it('stores a retiring try under its original scene without appending it to the replacement scene', async () => {
  let release: () => void = () => {};

  vi.mocked(keepTries).mockReturnValue(new Promise<void>((resolve) => (release = resolve)));

  const setProject = vi.fn();
  let storage: ReturnType<typeof useStoredTries>;

  function Harness() {
    storage = useStoredTries({
      project: DEFAULT_PROJECT,
      sceneId: 'original-scene',
      cases: [],
      sim: { model: { joints: [] } } as unknown as Simulation,
      setProject,
      showToast: vi.fn(),
    });

    return null;
  }

  renderToString(createElement(Harness));

  const record: TryRecord = {
    id: 'retiring-try',
    caseId: 'original-case',
    robot: 'arm',
    at: '2026-11-20T00:00:00Z',
    passed: false,
    margin: -1,
    seconds: 1,
    manifest: { formatVersion: 1, caseHash: 'case', modelHash: 'model', seed: 0, frames: 50, dt: 0.02 },
  };
  const pending = storage!.onTry(record, {} as Recording, null);

  expect(keepTries).toHaveBeenCalledWith([
    expect.objectContaining({
      stored: expect.objectContaining({
        sceneId: 'original-scene',
        case: expect.objectContaining({ id: 'original-case' }),
      }),
    }),
  ]);
  latest.current = 'replacement-scene';
  release();
  await pending;
  expect(setProject).not.toHaveBeenCalled();
});
