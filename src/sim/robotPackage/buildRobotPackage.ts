import type { MeshMeasure } from '../../three/meshMeasure';
import type { ProjectSettings, ScenePart } from '../../types/robotics';
import { partMasses } from '../../utils/engineering';
import { writeUrdf } from '../../utils/robotImport/urdfWriter';
import { binaryStl } from '../../utils/stlBytes';
import { zipFolder } from '../../utils/zipFolder';
import type { SimModel } from '../mjcfTypes';
import { jointMap } from './jointMap';
import { jsonBytes, policyFiles, type PackagedPolicy } from './policyFiles';
import { packageUri, ros2Control, rosPackageFiles, rosPackageName, ROS_URDF } from './rosPackage';

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
  const name = rosPackageName(robot);
  const map = jointMap({ model, project, parts, name: robot });
  const { urdf, meshes, root } = writeUrdf({
    name: robot,
    model,
    joints: project.joints ?? [],
    parts,
    masses: partMasses(parts, project, job.measures),
    triangles: (id) => job.triangles[id] ?? null,
    meshUri: packageUri(name),
    tail: ros2Control(map, new Set(model.joints.map((j) => j.name))),
  });
  const text = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    'robot.xml': text.encode(model.xml),
    [ROS_URDF]: text.encode(urdf),
    ...Object.fromEntries(Object.entries(meshes).map(([path, tris]) => [path, binaryStl(tris)])),
    'joint_map.json': jsonBytes(map),
    ...policyFiles(job.policies, model),
  };
  const ros = rosPackageFiles({ name, robot, fixedFrame: root, files: Object.keys(files) });

  return { ...files, ...Object.fromEntries(Object.entries(ros).map(([path, body]) => [path, text.encode(body)])) };
}

export const buildRobotPackage = (job: RobotPackageJob): Uint8Array => zipFolder(job.name, robotPackageFiles(job));
