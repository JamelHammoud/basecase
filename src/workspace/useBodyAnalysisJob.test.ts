import { useLayoutEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useBodyAnalysisJob } from './useBodyAnalysisJob';
import { readBodyEvidence, rememberBodyEvidence } from '../reality/bodyEvidence';
import type { BodyEvidenceRef, BodyEvidenceSnapshot } from '../reality/bodyEvidence';
import type { BodyMotionOutcome } from '../reality/bodyMotionTypes';
import type { WorkspaceCore } from './useWorkspaceCore';

const state = vi.hoisted(() => ({
  unit: 'arm-a',
  finish: (_value: BodyMotionOutcome) => {},
  recommend: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('react', () => ({
  useEffectEvent: (callback: unknown) => callback,
  useLayoutEffect: vi.fn(),
  useRef: (current: unknown) => ({ current }),
  useState: (value: unknown) => [value, vi.fn()],
}));
vi.mock('../robot/robotStore', () => ({
  selectedUnit: () => state.unit,
  robotSnapshot: () => ({ link: 'connected' }),
}));
vi.mock('../reality/bodyClient', () => ({
  bodyClient: () => ({ recommend: state.recommend, dispose: state.dispose }),
}));
vi.mock('../reality/bodyRecordingIdentity', () => ({ bodyRecordingUnchanged: async () => true }));
vi.mock('../reality/bodyEvidence', () => ({
  readBodyEvidence: vi.fn(),
  rememberBodyEvidence: vi.fn(),
  withBodyEvidence: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.unit = 'arm-a';
  state.recommend.mockImplementation(
    () =>
      new Promise<BodyMotionOutcome>((resolve) => {
        state.finish = resolve;
      }),
  );
  vi.mocked(readBodyEvidence).mockResolvedValue({
    request: { source: { unit: 'arm-a' } },
    result: { kind: 'analyzed' },
    calibration: { active: 3 },
    sourceKey: 'original',
  } as BodyEvidenceSnapshot);
});

it.each(['unit', 'scene', 'source', 'calibration', 'cancel'])(
  'disposes the submitted worker and rejects a late reply after %s changes',
  async (cause) => {
    const parts: WorkspaceCore['parts'] = [];
    const project = { bodyCalibrations: { original: { active: 3 } } };
    const core = {
      parts,
      project,
      docs: { partsRef: { current: parts }, projectRef: { current: project }, updateProjectNow: vi.fn() },
    } as unknown as WorkspaceCore;
    const report = vi.fn();
    const job = useBodyAnalysisJob({
      core,
      unit: 'arm-a',
      selected: 'original-try',
      reference: { unit: 'arm-a', recording: 'original-try' } as BodyEvidenceRef,
      open: true,
      applicable: true,
      report,
    });
    const cleanup = vi.mocked(useLayoutEffect).mock.calls[0][0]();

    job.run('recommend', [0]);
    await vi.waitFor(() => expect(state.recommend).toHaveBeenCalledOnce());
    expect(state.recommend.mock.calls[0][0].speedRadS).toBe(0.5);

    if (cause === 'unit') state.unit = 'arm-b';

    if (cause === 'source') core.docs.partsRef.current = [];

    if (cause === 'calibration') core.docs.projectRef.current = {} as WorkspaceCore['project'];

    if (cause === 'cancel') job.cancel();

    cleanup?.();
    state.finish({ kind: 'no-improvement' } as BodyMotionOutcome);
    await vi.waitFor(() => expect(state.dispose).toHaveBeenCalled());
    await Promise.resolve();
    expect(rememberBodyEvidence).not.toHaveBeenCalled();
    expect(core.docs.updateProjectNow).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(project.bodyCalibrations.original.active).toBe(3);
  },
);
