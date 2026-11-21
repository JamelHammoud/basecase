import { useLayoutEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useBodyExecution } from './useBodyExecution';
import { executeBodyEvidence } from './bodyExecutionAction';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { BodyEvidenceRef } from '../reality/bodyEvidence';
import type { RobotEvent } from '../robot/robotState';
import { DEFAULT_PROJECT } from '../types/robotics';

const state = vi.hoisted(() => ({ hear: (_event: RobotEvent) => {}, unsubscribe: vi.fn() }));

vi.mock('react', () => ({
  useEffectEvent: (callback: unknown) => callback,
  useLayoutEffect: vi.fn(),
  useRef: (current: unknown) => ({ current }),
  useState: (current: unknown) => [current, vi.fn()],
}));
vi.mock('./bodyExecutionAction', () => ({ executeBodyEvidence: vi.fn() }));
vi.mock('../robot/robotStore', () => ({
  selectedUnit: () => 'robot',
  subscribeFleetEvents: (callback: typeof state.hear) => {
    state.hear = callback;

    return state.unsubscribe;
  },
}));

beforeEach(() => vi.clearAllMocks());

it('selects the actual recording arriving after explicit cancellation has released execution', async () => {
  const parts: WorkspaceCore['parts'] = [];
  const project: WorkspaceCore['project'] = { ...DEFAULT_PROJECT };
  const core = {
    parts,
    project,
    docs: { partsRef: { current: parts }, projectRef: { current: project } },
  } as WorkspaceCore;
  const recorded = vi.fn();
  const reference = { content: 'a'.repeat(64) } as BodyEvidenceRef;
  let finish = () => {};

  vi.mocked(executeBodyEvidence).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(null);
      }),
  );

  const execution = useBodyExecution({ core, unit: 'robot', reference, open: true, recorded });
  const unsubscribe = vi.mocked(useLayoutEffect).mock.calls[1][0]();

  execution.run();
  execution.cancel();
  expect(vi.mocked(executeBodyEvidence).mock.calls[0][0].signal.aborted).toBe(true);
  finish();
  await Promise.resolve();
  await Promise.resolve();
  state.hear({
    event: 'recorded',
    unit: 'other',
    manifest: { id: 'wrong', bodyMotion: { recommendation: reference.content } },
  });
  expect(recorded).not.toHaveBeenCalled();
  state.hear({
    event: 'recorded',
    unit: 'robot',
    manifest: { id: 'actual', bodyMotion: { recommendation: reference.content } },
  });
  state.hear({
    event: 'recorded',
    unit: 'robot',
    manifest: { id: 'duplicate', bodyMotion: { recommendation: reference.content } },
  });
  expect(recorded).toHaveBeenCalledExactlyOnceWith('actual');
  unsubscribe?.();
  expect(state.unsubscribe).toHaveBeenCalledOnce();
});
