import { describe, expect, it, vi } from 'vitest';
import { fixturePackageJob } from '../sim/fixtures/robotPackage';
import { fixtureRobots } from '../sim/fixtures/robots';
import { robotJointMapJob } from './robotPackageExport';
import type { WorkspaceCore } from './useWorkspaceCore';

describe('robot computer package input', () => {
  it('prepares the joint map without measuring geometry or loading policy files', async () => {
    const arm = fixtureRobots().find((robot) => robot.id === 'arm-3dof')!;
    const { job } = fixturePackageJob(arm);
    const measureParts = vi.fn();
    const partTriangles = vi.fn();
    const loadPolicy = vi.fn();
    const buildModel = vi.fn();
    const core = {
      posing: { hasRig: true },
      simTraining: { sim: { model: job.model, buildModel }, training: { loadPolicy } },
      viewportRef: { current: { measureParts, partTriangles } },
      scene: { sceneName: arm.id },
      project: job.project,
      parts: job.parts,
    } as unknown as WorkspaceCore;
    const input = await robotJointMapJob(core);

    expect(input).toEqual({
      name: job.model.robots[0].name,
      model: { joints: job.model.joints, robots: job.model.robots },
      project: job.project,
      parts: job.parts,
    });
    expect(measureParts).not.toHaveBeenCalled();
    expect(partTriangles).not.toHaveBeenCalled();
    expect(loadPolicy).not.toHaveBeenCalled();
    expect(buildModel).not.toHaveBeenCalled();
  });
});
