import { cameraViews, stripParts } from '../cameras/views';
import { castOf, stageCase } from '../cases/caseCast';
import { caseWorldItems } from '../cases/importedWorldItems';
import { parseCase } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import type { StoredTry } from '../cases/tryFile';
import { registerWorldAsset, type WorldAssets } from '../cases/worldAssets';
import { caseWorldView } from '../cases/worldView';
import { calibratedModel } from '../sim/calibratedModel';
import type { MeshFiles } from '../three/componentMeshes';
import { headlessParts } from '../three/headlessParts';
import { DEFAULT_PROJECT, type SavedSceneRecord } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { reply } from '../utils/workerRpc';
import type { TryFrameScene } from './tryFramesTypes';
import { trySceneFloor } from './trySceneFloor';

export interface TrySceneInput {
  scene: Pick<SavedSceneRecord, 'parts' | 'project'>;
  stored: StoredTry;
  partners: SlotRobot[];
  meshes: MeshFiles;
  assets: WorldAssets;
}

export async function prepareTryScene(input: TrySceneInput): Promise<TryFrameScene> {
  for (const [hash, asset] of Object.entries(input.assets)) registerWorldAsset(hash, asset);

  const { scene, meshes } = input;
  const project = scene.project ?? DEFAULT_PROJECT;
  const loaded = await headlessParts(scene.parts, project.joints ?? [], meshes);
  const lead = { parts: scene.parts, rig: buildRig(loaded.joints, scene.parts) };
  const authored = project.cases?.find((kase) => kase.id === input.stored.case?.id);

  if (input.stored.case && !authored) throw new Error('The try’s Case could not be opened.');

  const staged = authored ? stageCase(parseCase(authored), lead, input.partners) : null;
  const cast = staged ? castOf(staged, lead) : lead;
  const world = staged ? caseWorldItems(staged.kase) : [];
  const measured = staged?.guests.length ? await headlessParts(cast.parts, cast.rig.joints, meshes) : loaded;
  const posedFloor = await trySceneFloor(scene.parts, lead.rig, project.pose);
  const model = calibratedModel(
    { parts: cast.parts, rig: cast.rig, project, ...measured, world, pose: project.pose, posedFloor },
    project.servoCalibrations,
  );
  const parts = stripParts(cast.parts);

  return {
    parts,
    world,
    rig: cast.rig,
    model,
    views: cameraViews(parts, world, project.cameras),
    ...(staged ? { kase: staged.kase, imported: caseWorldView(staged.kase) } : {}),
  };
}

export const trySceneJobs = { build: async (input: TrySceneInput) => reply(await prepareTryScene(input)) };
