import { beforeEach, expect, it, vi } from 'vitest';
import { fitBodyEvidence } from './bodyActions';
import { DEFAULT_PROJECT } from '../types/robotics';
import { readBodyEvidence } from '../reality/bodyEvidence';
import type { BodyEvidenceRef, BodyEvidenceSnapshot } from '../reality/bodyEvidence';
import { bodyRecordingUnchanged } from '../reality/bodyRecordingIdentity';
import { BODY_EMULATOR_LIMIT } from '../reality/bodyExperimentTypes';
import { platformBridge } from '../utils/platformBridge';
import type { WorkspaceCore } from './useWorkspaceCore';

const worker = vi.hoisted(() => ({ fit: vi.fn(), dispose: vi.fn() }));

vi.mock('../robot/robotStore', () => ({ selectedUnit: () => 'robot', robotSceneJoints: () => ['shoulder'] }));
vi.mock('../reality/bodyClient', () => ({ bodyClient: () => worker }));
vi.mock('../reality/bodyEvidence', () => ({
  readBodyEvidence: vi.fn(),
  bodySourceKey: async () => 'source',
  rememberBodyEvidence: vi.fn(),
  withBodyEvidence: vi.fn(),
}));
vi.mock('../reality/bodyRecordingIdentity', () => ({ bodyRecordingUnchanged: vi.fn() }));
vi.mock('../utils/platformBridge', () => ({ platformBridge: { robotReadRun: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readBodyEvidence).mockResolvedValue({
    request: { run: { observations: 'servo-independent-1' } },
  } as BodyEvidenceSnapshot);
  vi.mocked(bodyRecordingUnchanged).mockResolvedValue(true);
});

it.each(['bound', 'missing', 'stale', 'other unit'] as const)(
  'never falls back to the newest run or changes the incumbent for %s evidence',
  async (scenario) => {
    const project = {
      ...DEFAULT_PROJECT,
      bodyCalibrations: {
        arm: {
          versions: [
            {
              version: 1,
              verdict: 'measured',
              fit: { massScales: { link: 1.2 }, payloadKg: {}, floorFrictionScale: 1 },
            },
          ],
          active: 1,
        },
      },
    };
    const before = structuredClone(project);
    const update = vi.fn();
    const build = vi.fn();
    const core = {
      posing: { rig: { robots: [{ key: 'arm' }], robotOf: new Map([['shoulder', 'arm']]) } },
      docs: { partsRef: { current: [] }, projectRef: { current: project }, updateProjectNow: update },
      simTraining: { sim: { buildModel: build } },
    } as unknown as WorkspaceCore;
    const reference = { unit: scenario === 'other unit' ? 'robot-2' : 'robot', sourceKey: 'source' } as BodyEvidenceRef;

    if (scenario === 'missing') vi.mocked(readBodyEvidence).mockResolvedValue(null);

    if (scenario === 'stale') vi.mocked(bodyRecordingUnchanged).mockResolvedValue(false);

    const message = await fitBodyEvidence(core, reference);
    const messages = {
      bound: BODY_EMULATOR_LIMIT,
      missing: 'Record a robot run in Operate before fitting its body.',
      stale: 'The source changed.',
      'other unit': 'The source changed.',
    };

    expect(message).toBe(messages[scenario]);
    expect(platformBridge.robotReadRun).not.toHaveBeenCalled();
    expect(worker.fit).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(project).toEqual(before);
    expect(worker.dispose).toHaveBeenCalledOnce();
  },
);
