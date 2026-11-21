import { useEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { openBodyAnalysis, useBodyAnalysis } from './useBodyAnalysis';
import type { WorkspaceCore } from './useWorkspaceCore';
import { bodySourceKey, readBodyEvidence } from '../reality/bodyEvidence';
import type { BodyEvidenceRef } from '../reality/bodyEvidence';
import type { TrySummary } from '../cases/tryFile';
import type { BodyEvidenceSnapshot } from '../reality/bodyEvidence';

const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0, tries: [] as TrySummary[] }));

vi.mock('react', () => ({
  useEffect: vi.fn(),
  useLayoutEffect: vi.fn(),
  useRef: (current: unknown) => ({ current }),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useState: (initial: unknown) => {
    const index = state.index++;

    if (state.values.length <= index) state.values.push(initial);

    return [
      state.values[index],
      (value: unknown) => {
        state.values[index] = value;
      },
    ];
  },
}));
vi.mock('../robot/useRobot', () => ({ useFleet: () => ({ selected: 'robot' }) }));
vi.mock('../cases/tryStore', () => ({
  useTries: () => state.tries,
  loadManifests: vi.fn(),
  loadSession: vi.fn(),
}));
vi.mock('../reality/bodyEvidence', () => ({
  bodySourceKey: vi.fn(),
  readBodyEvidence: vi.fn(),
  rememberBodyEvidence: vi.fn(),
  evidenceApplicable: vi.fn(),
  withBodyEvidence: vi.fn(),
}));

function coreFor(bodyEvidence?: BodyEvidenceRef[]) {
  return {
    scene: { sceneId: 'arm' },
    active: true,
    tool: { leftTab: 'operate' },
    studio: { isLeftOpen: true },
    parts: [],
    project: { bodyEvidence },
  } as unknown as WorkspaceCore;
}

beforeEach(() => {
  state.values = [];
  state.index = 0;
  state.tries = [];
  vi.clearAllMocks();
});

it('keeps chosen parameters when the same retained analysis is decoded again', async () => {
  const reference = {
    unit: 'robot',
    scene: 'arm',
    recording: 'run-a',
    modelHash: 'model',
    sourceKey: 'physical',
  } as BodyEvidenceRef;
  const core = coreFor([reference]);
  const saved = { result: { kind: 'analyzed' } } as BodyEvidenceSnapshot;

  vi.mocked(readBodyEvidence).mockResolvedValue(saved);
  openBodyAnalysis('arm');
  useBodyAnalysis(core);
  vi.mocked(useEffect).mock.calls.at(-1)![0]();
  await Promise.resolve();
  state.index = 0;

  const first = useBodyAnalysis(core);

  first.toggle(0);
  vi.mocked(readBodyEvidence).mockResolvedValue(structuredClone(saved));
  vi.mocked(useEffect).mock.calls.at(-1)![0]();
  await Promise.resolve();
  state.index = 0;
  expect(useBodyAnalysis(core).parameters).toEqual([0]);
});

it('shows a source-check failure instead of leaving an unexplained disabled investigation', async () => {
  const core = coreFor();
  const failure = new Error('Body analysis source exceeds its storage limit.');

  vi.mocked(bodySourceKey).mockRejectedValue(failure);
  openBodyAnalysis('arm');
  useBodyAnalysis(core);

  const cleanup = vi.mocked(useEffect).mock.calls[1][0]();

  await vi.waitFor(() => expect(state.values).toContainEqual(expect.objectContaining({ problem: failure.message })));
  state.index = 0;

  const analysis = useBodyAnalysis(core);

  expect(analysis.open).toBe(true);
  expect(analysis.ready).toBe(false);
  expect(analysis.problem).toBe(failure.message);
  cleanup?.();
  analysis.close();
});

it('keeps retained history selectable after newer recordings or removal of its manifest', () => {
  state.tries = Array.from({ length: 40 }, (_, index) => ({
    id: `run-${index}`,
    sceneId: 'arm',
    source: 'operate',
    startedAt: '2026-11-20T12:00:00',
  })) as TrySummary[];

  const reference = { unit: 'offline-arm', scene: 'arm', recording: 'run-0' } as BodyEvidenceRef;
  const core = coreFor([reference]);

  openBodyAnalysis('arm');

  const analysis = useBodyAnalysis(core);

  expect(analysis.choices).toHaveLength(33);
  expect(analysis.choices[0]).toEqual({ value: 'run-0', label: 'offline-arm run-0' });
  expect(analysis.selected).toBe('run-39');
  expect(analysis.choices.at(-1)?.label).toBe('Nov 20 run-39');
  analysis.pick('run-0');
  state.index = 0;
  state.tries = state.tries.slice(1);

  const reopened = useBodyAnalysis(core);

  expect(reopened.choices[0].value).toBe('run-0');
  expect(reopened.selected).toBe('run-0');
  reopened.close();
});
