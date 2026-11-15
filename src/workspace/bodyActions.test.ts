import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotRun } from '../robot/runBuffer';
import type { BodyCalibration } from '../reality/bodyTypes';
import { bodyClient } from '../reality/bodyClient';
import { platformBridge } from '../utils/platformBridge';
import {
  bodyEvidenceText,
  fitBodyFor,
  fitBodyFromUi,
  fitRecordedBody,
  rollBackBodyCalibration,
  setBodyRun,
} from './bodyActions';
import type { WorkspaceCore } from './useWorkspaceCore';

vi.mock('../reality/bodyClient', () => ({ bodyClient: vi.fn() }));
vi.mock('../utils/platformBridge', () => ({ platformBridge: { robotReadRun: vi.fn(async () => null) } }));

const result: BodyCalibration = {
  version: 0,
  verdict: 'measured',
  robot: 'arm',
  fit: { massScales: { forearm: 1.3 }, payloadKg: { hand: 0.15 }, floorFrictionScale: 1 },
  evidence: { presetErrorRad: 0.12, fittedErrorRad: 0.04, gain: 2 / 3 },
  modelFingerprint: 'baseline',
};
const model = { robots: [{ key: 'arm' }] } as SimModel;
const run = { joints: ['shoulder'], statuses: [], intents: [] } as unknown as RobotRun;

beforeEach(() => {
  vi.clearAllMocks();
  setBodyRun(null);
});

function context() {
  let project: ProjectSettings = { ...DEFAULT_PROJECT };
  const fit = vi.fn(async () => result);
  const input = {
    model,
    run,
    robot: 'arm',
    fit,
    updateProject: (change: (project: ProjectSettings) => ProjectSettings) => {
      project = change(project);
    },
  };

  return { input, fit, project: () => project };
}

describe('body fitting actions', () => {
  it('keeps recorded results in Operate without a duplicate toast and reports a missing recording', async () => {
    const ctx = context();
    const operateVisible = vi.fn(() => true);
    const core = {
      docs: {
        partsRef: { current: [] },
        projectRef: { current: ctx.project() },
        updateProjectNow: ctx.input.updateProject,
      },
      posing: { rig: { robots: [{ key: 'arm' }], robotOf: new Map() } },
      simTraining: { sim: { buildModel: vi.fn(async () => model) } },
      showToast: vi.fn(),
      operateVisible,
    } as unknown as WorkspaceCore;

    vi.mocked(bodyClient).mockReturnValue({ fit: ctx.fit, dispose: vi.fn() });
    setBodyRun(run);
    await fitBodyFromUi(core);
    expect(ctx.project().bodyCalibrations?.arm.active).toBe(1);
    expect(core.showToast).not.toHaveBeenCalled();
    await fitBodyFromUi(core);
    expect(core.showToast).toHaveBeenCalledWith('Record a robot run in Operate before fitting its body.');
    operateVisible.mockReturnValue(false);
    setBodyRun(run);
    await fitBodyFromUi(core);
    expect(core.showToast).toHaveBeenLastCalledWith(bodyEvidenceText(result));
  });

  it('shows linear errors in millimetres and mixed errors as dimensionless improvement', () => {
    expect(bodyEvidenceText({ ...result, evidence: { ...result.evidence, units: 'm' } })).toBe(
      '120.00 mm with the preset, 40.00 mm with the fit.',
    );
    expect(bodyEvidenceText({ ...result, evidence: { ...result.evidence, units: 'mixed' } })).toBe(
      'Replay improvement: 66.7%.',
    );
    expect(bodyEvidenceText({ ...result, evidence: { ...result.evidence, units: 'mixed' } })).not.toContain('°');
  });

  it('uses the worker result and records one version on the requested robot', async () => {
    const ctx = context();
    const reply = await fitRecordedBody(ctx.input);

    expect(ctx.fit).toHaveBeenCalledWith({ model, run, robot: 'arm' });
    expect(ctx.project().bodyCalibrations?.arm.active).toBe(1);
    expect(reply).toMatch(/6.88°.*2.29°/);
    expect(ctx.project().bodyCalibrations?.arm.versions[0].fit).toEqual(result.fit);
  });

  it('keeps a cant-tell attempt without changing the active fit and rolls back separately', async () => {
    const ctx = context();

    await fitRecordedBody(ctx.input);
    ctx.fit.mockResolvedValue({ ...result, verdict: 'cant-tell' });
    expect(await fitRecordedBody(ctx.input)).toMatch(/Can’t tell/);
    expect(ctx.project().bodyCalibrations?.arm.active).toBe(1);
    rollBackBodyCalibration(ctx.input.updateProject, 'arm');
    expect(ctx.project().bodyCalibrations?.arm.active).toBeNull();
    expect(ctx.project().bodyCalibrations?.arm.versions).toHaveLength(2);
  });

  it('discards a worker result after the model changes and consumes seeded evidence once', async () => {
    const ctx = context();
    const projectRef = { current: ctx.project() };
    const partsRef = { current: [] };
    const dispose = vi.fn();
    const workerFit = vi.fn(async () => {
      projectRef.current = { ...projectRef.current, joints: [] };

      return result;
    });
    const core = {
      docs: { partsRef, projectRef, updateProjectNow: ctx.input.updateProject },
      posing: { rig: { robots: [{ key: 'arm' }], robotOf: new Map() } },
      simTraining: { sim: { buildModel: vi.fn(async () => model) } },
    } as unknown as WorkspaceCore;

    vi.mocked(bodyClient).mockReturnValue({ fit: workerFit, dispose });
    setBodyRun(run);
    await expect(fitBodyFor(core)).rejects.toThrow('robot changed during fitting');
    expect(ctx.project().bodyCalibrations).toBeUndefined();
    expect(dispose).toHaveBeenCalledOnce();
    expect(await fitBodyFor(core)).toContain('Record a robot run');
    expect(platformBridge.robotReadRun).toHaveBeenCalledOnce();
  });
});
