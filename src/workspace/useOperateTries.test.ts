import { useEffectEvent } from 'react';
import { expect, it, vi } from 'vitest';
import { useOperateTries } from './useOperateTries';
import { keepTries, loadSession } from '../cases/tryStore';
import type { StoredTry } from '../cases/tryFile';
import { openDataImport } from '../datasets/import/dataImportClient';
import { retainBodyRecording } from '../reality/bodyRecordingEvidence';
import type { BodyEvidenceRef } from '../reality/bodyEvidence';
import type { RobotEvent } from '../robot/robotState';
import type { Simulation } from '../sim/useSimulation';
import type { SimModel } from '../sim/mjcfTypes';
import { DEFAULT_PROJECT } from '../types/robotics';

vi.mock('react', () => ({
  useEffect: vi.fn(),
  useEffectEvent: vi.fn((callback) => callback),
  useRef: (current: unknown) => ({ current }),
}));
vi.mock('../robot/useRobot', () => ({ useRobot: () => ({ link: 'closed' }) }));
vi.mock('../cameras/operator/operatorCamera', () => ({ useOperatorCamera: () => ({ stream: null }) }));
vi.mock('../cases/tryStore', () => ({ loadSession: vi.fn(), keepTries: vi.fn(), noteStoredTry: vi.fn() }));
vi.mock('../datasets/import/dataImportClient', () => ({ openDataImport: vi.fn() }));
vi.mock('../reality/bodyRecordingEvidence', () => ({ bodyRecordingContext: vi.fn(), retainBodyRecording: vi.fn() }));

it('finishes ordinary replay preparation before publishing optional evidence that replaces its project', async () => {
  const stored: StoredTry = {
    version: 1,
    id: 'recorded-arm',
    sceneId: 'scene-arm',
    robot: { name: 'Arm', modelHash: 'a'.repeat(64), joints: ['shoulder'] },
    case: null,
    source: 'operate',
    input: null,
    startedAt: '2026-11-20T00:00:00Z',
    seconds: 1,
    rate: 1,
    frames: 2,
    outcome: { verdict: 'unjudged', margin: null },
    seed: 0,
    sourceTry: null,
    faults: [],
  };
  const evidence: BodyEvidenceRef = {
    recording: stored.id,
    unit: 'robot',
    scene: stored.sceneId,
    content: 'snapshot',
    modelHash: stored.robot.modelHash,
    sourceKey: 'source',
    joints: stored.robot.joints,
    analyzed: false,
  };
  let project = DEFAULT_PROJECT;
  const updateProject = vi.fn((change) => {
    project = change(project);
  });
  const model = { xml: '<mujoco/>' } as SimModel;
  const buildModel = vi.fn(async () => {
    await Promise.resolve();
    expect(project).toBe(DEFAULT_PROJECT);

    return model;
  });
  const replay = vi.fn(async () => {
    expect(project).toBe(DEFAULT_PROJECT);

    return { frames: 2, t: [0, 1], dt: 1 };
  });
  const close = vi.fn();

  vi.mocked(openDataImport).mockReturnValue({ replay, close } as unknown as ReturnType<typeof openDataImport>);
  vi.mocked(loadSession).mockResolvedValue('{"k":"status","t":0,"q":[0]}\n{"k":"status","t":1,"q":[0.5]}');
  vi.mocked(retainBodyRecording).mockResolvedValue(evidence);
  useOperateTries({
    active: false,
    sceneId: stored.sceneId,
    joints: [],
    sim: { modelNow: () => null, buildModel } as unknown as Simulation,
    project,
    parts: [],
    updateProject,
    showToast: vi.fn(),
  });

  const onRecorded = vi.mocked(useEffectEvent).mock.calls[2][0] as (event: RobotEvent) => Promise<void>;

  await onRecorded({ event: 'recorded', manifest: stored, unit: 'robot' });
  expect(buildModel).toHaveBeenCalledOnce();
  expect(replay).toHaveBeenCalledOnce();
  expect(keepTries).toHaveBeenCalledWith([
    expect.objectContaining({ stored, recording: { frames: 2, t: [0, 1], dt: 1 } }),
  ]);
  expect(project.bodyEvidence).toEqual([evidence]);
  expect(close).toHaveBeenCalledOnce();
});
