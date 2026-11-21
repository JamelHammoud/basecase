import { robotPartIds, type RobotPackageJob } from '../sim/robotPackage/buildRobotPackage';
import type { JointMapInput } from '../sim/robotPackage/jointMap';
import type { PackagedPolicy } from '../sim/robotPackage/policyFiles';
import { exportRobotPackageZip } from '../sim/robotPackage/robotPackageClient';
import { fileSafe } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';

export interface RobotPackageZip {
  zip: Uint8Array;
  name: string;
  mjcf: string;
}

async function scenePolicies(core: WorkspaceCore): Promise<PackagedPolicy[]> {
  const { training } = core.simTraining;
  const found = await Promise.all(
    (core.project.policies ?? []).map(async (record) => {
      const spec = await training.loadPolicy(record.id);

      return spec ? { record, spec } : null;
    }),
  );

  return found.filter((p): p is PackagedPolicy => !!p);
}

async function robotPackageInput(core: WorkspaceCore, fresh = false) {
  const { sim } = core.simTraining;

  if (!core.posing.hasRig) return null;

  const model = (!fresh && sim.model) || (await sim.buildModel());
  const input: JointMapInput = {
    name: model.robots.length === 1 ? model.robots[0].name : core.scene.sceneName,
    model: { joints: model.joints, robots: model.robots },
    parts: core.parts,
    project: core.project,
  };

  return { model, input };
}

export async function robotJointMapJob(core: WorkspaceCore, fresh = false): Promise<JointMapInput | null> {
  return (await robotPackageInput(core, fresh))?.input ?? null;
}

export async function robotPackageJob(core: WorkspaceCore): Promise<RobotPackageJob | null> {
  const viewport = core.viewportRef.current;

  if (!viewport) return null;

  const source = await robotPackageInput(core);

  if (!source) return null;

  const { model, input } = source;
  const ids = robotPartIds(model);
  const measured = await viewport.measureParts();
  const triangles: Record<string, Float32Array> = {};

  for (const id of ids) {
    const t = viewport.partTriangles(id);

    if (t) triangles[id] = t;
  }

  return {
    ...input,
    name: `${fileSafe(core.scene.sceneName)}-robot`,
    robot: input.name,
    model,
    measures: Object.fromEntries(ids.map((id) => [id, measured[id]])),
    triangles,
    policies: await scenePolicies(core),
  };
}

export async function robotPackageZip(core: WorkspaceCore): Promise<RobotPackageZip | null> {
  const job = await robotPackageJob(core);

  if (!job) return null;

  return { zip: await exportRobotPackageZip(job), name: job.name, mjcf: job.model.xml };
}
