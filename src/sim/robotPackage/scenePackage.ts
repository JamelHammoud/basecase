import { simCalibrations } from '../../reality/history';
import { SERVO_POPULATIONS } from '../../reality/servoPopulations';
import { calibratedInput } from '../../reality/calibratedInput';
import type { MeshFiles } from '../../three/componentMeshes';
import { headlessParts } from '../../three/headlessParts';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { buildRig } from '../../utils/kinematics';
import type { SharedScene } from '../../utils/sceneFile';
import { buildMjcf } from '../mjcf';
import { robotPackageFiles, robotPartIds } from './buildRobotPackage';

export async function scenePackageFiles(scene: SharedScene, meshes: MeshFiles): Promise<Record<string, Uint8Array>> {
  const project = scene.project ?? DEFAULT_PROJECT;
  const { joints, measures, partTriangles } = await headlessParts(scene.parts, project.joints ?? [], meshes);
  const rig = buildRig(joints, scene.parts);
  const input = { parts: scene.parts, rig, project, measures, partTriangles };
  const model = buildMjcf(calibratedInput(input, simCalibrations(project.servoCalibrations), SERVO_POPULATIONS));
  const ids = robotPartIds(model);
  const triangles: Record<string, Float32Array> = {};

  for (const id of ids) {
    const t = partTriangles(id);

    if (t) triangles[id] = t;
  }

  return robotPackageFiles({
    name: scene.name,
    robot: model.robots.length === 1 ? model.robots[0].name : scene.name,
    model,
    parts: scene.parts,
    project,
    measures: Object.fromEntries(ids.map((id) => [id, measures[id]])),
    triangles,
    policies: [],
  });
}
