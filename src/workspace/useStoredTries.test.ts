import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { deleteTries, keepTries } from '../cases/tryStore';
import type { TryRecord } from '../cases/tries';
import type { Recording } from '../sim/recorder';
import type { Simulation } from '../sim/useSimulation';
import { DEFAULT_PROJECT } from '../types/robotics';
import { caseTryCallbacks } from './caseBranchActions';
import { useStoredTries } from './useStoredTries';

vi.mock('../cases/tryStore', () => ({
  useTries: () => [],
  keepTries: vi.fn(),
  deleteTries: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

it.each([false, true])(
  'keeps normal try storage tied to its source through the async write, edited=%s',
  async (edited) => {
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const setProject = vi.fn();
    const showToast = vi.fn();
    const record: TryRecord = {
      id: 'try-person-crossing',
      caseId: 'crossing',
      robot: 'Rover',
      at: '2026-11-20T00:00:00.000Z',
      passed: true,
      margin: 1,
      seconds: 2,
      manifest: {
        formatVersion: 1,
        caseHash: 'c'.repeat(64),
        modelHash: 'm'.repeat(64),
        seed: 0,
        frames: 100,
        dt: 0.02,
        faults: [],
      },
    };
    const recording = { frames: 100 } as Recording;
    let storage: ReturnType<typeof useStoredTries>;
    let valid = true;

    vi.mocked(keepTries).mockReturnValue(pending);

    function Harness() {
      storage = useStoredTries({
        project: DEFAULT_PROJECT,
        setProject,
        sceneId: 'crossing-scene',
        cases: [],
        sim: { model: null } as Simulation,
        showToast,
      });

      return null;
    }

    renderToString(createElement(Harness));

    const callbacks = caseTryCallbacks({}, storage!.onTries, showToast);
    const saving = callbacks.onTry(record, recording, 'script', () => valid);

    expect(keepTries).toHaveBeenCalledOnce();
    expect(setProject).not.toHaveBeenCalled();
    valid = !edited;
    complete();
    await saving;
    expect(setProject).toHaveBeenCalledTimes(Number(!edited));
    expect(deleteTries).toHaveBeenCalledTimes(Number(edited));

    if (edited) expect(deleteTries).toHaveBeenCalledWith([record.id]);

    expect(showToast).not.toHaveBeenCalled();
  },
);
