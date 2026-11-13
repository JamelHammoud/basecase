import type { MeshMeasure } from '../../three/meshMeasure';
import type { ProjectSettings, ScenePart } from '../../types/robotics';
import { partMasses } from '../../utils/engineering';
import { writeUrdf } from '../../utils/robotImport/urdfWriter';
import { binaryStl } from '../../utils/stlBytes';
import { zipFolder } from '../../utils/zipFolder';
import type { SimModel } from '../mjcfTypes';
import { jointMap } from './jointMap';
import { jsonBytes, policyFiles, type PackagedPolicy } from './policyFiles';

export interface RobotPackageJob {
  name: string;
  robot: string;
  model: SimModel;
  parts: ScenePart[];
  project: ProjectSettings;
  measures: Record<string, MeshMeasure | undefined>;
  triangles: Record<string, Float32Array>;
  policies: PackagedPolicy[];
}

export function robotPartIds(model: Pick<SimModel, 'bodies'>): string[] {
  return model.bodies.filter((b) => b.robot).flatMap((b) => b.parts);
}

export function robotPackageFiles(job: RobotPackageJob): Record<string, Uint8Array> {
  const { model, project, parts, robot } = job;
  const { urdf, meshes } = writeUrdf({
    name: robot,
    model,
    joints: project.joints ?? [],
    parts,
    masses: partMasses(parts, project, job.measures),
    triangles: (id) => job.triangles[id] ?? null,
  });
  const text = new TextEncoder();

  return {
    'robot.xml': text.encode(model.xml),
    'robot.urdf': text.encode(urdf),
    ...Object.fromEntries(Object.entries(meshes).map(([path, tris]) => [path, binaryStl(tris)])),
    'joint_map.json': jsonBytes(jointMap({ model, project, parts, name: robot })),
    ...policyFiles(job.policies, model),
  };
}

export const buildRobotPackage = (job: RobotPackageJob): Uint8Array => zipFolder(job.name, robotPackageFiles(job));
