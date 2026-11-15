import { cameraViews, stripParts } from '../cameras/views';
import { stageCase } from '../cases/caseCast';
import { worldItem, type Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { sha256 } from '../cases/tries';
import type { StoredTry } from '../cases/tryFile';
import { sceneWorldAssets } from '../cases/worldAssets';
import { caseWorldView } from '../cases/worldView';
import type { Simulation } from '../sim/useSimulation';
import { sourcedMeshFiles } from '../three/componentMeshes';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { buildRig, type Rig } from '../utils/kinematics';
import { loadSceneRecord } from '../utils/sceneRecords';
import type { TryFrameScene } from '../vision/tryFramesTypes';
import { buildTryScene } from '../vision/trySceneClient';

interface FrameLabelSceneContext {
  sceneId: string;
  parts: ScenePart[];
  project: ProjectSettings;
  rig: Rig;
  sim: Simulation;
  cases: Case[];
  partners: () => SlotRobot[];
}

async function currentScene(stored: StoredTry, current: FrameLabelSceneContext): Promise<TryFrameScene | null> {
  const model = current.sim.modelNow();

  if (!model || (await sha256(model.xml)) !== stored.robot.modelHash) return null;

  const authored = current.cases.find((kase) => kase.id === stored.case?.id);

  if (stored.case && !authored) throw new Error('The try’s Case could not be opened.');

  const staged = authored ? stageCase(authored, current, current.partners()) : null;
  const joined = [...current.parts, ...current.sim.guestParts];
  const guests = current.sim.worldNow().guests;
  const rig = guests.parts.length ? buildRig([...current.rig.joints, ...guests.joints], joined) : current.rig;
  const parts = stripParts(joined);
  const world = current.sim.worldParts;

  return {
    parts,
    world,
    model,
    rig,
    views: cameraViews(parts, world, current.project.cameras),
    meshes: await sourcedMeshFiles([...parts, ...world]),
    ...(staged ? { kase: staged.kase, imported: caseWorldView(staged.kase) } : {}),
  };
}

export async function loadFrameLabelScene(stored: StoredTry, current: FrameLabelSceneContext): Promise<TryFrameScene> {
  const own = stored.sceneId === current.sceneId;
  const loaded = own ? await currentScene(stored, current) : null;

  if (loaded) return loaded;

  const scene = own ? { parts: current.parts, project: current.project } : await loadSceneRecord(stored.sceneId);

  if (!scene) throw new Error('The try’s source scene could not be opened.');

  const partners = current.partners();
  const world = scene.project?.cases?.flatMap((kase) => kase.world.objects.map(worldItem)) ?? [];
  const meshes = await sourcedMeshFiles([...scene.parts, ...world, ...partners.flatMap((robot) => robot.parts)]);
  const rebuilt = await buildTryScene({ scene, stored, partners, meshes, assets: sceneWorldAssets(scene.project) });

  if (!rebuilt.model || (await sha256(rebuilt.model.xml)) !== stored.robot.modelHash)
    throw new Error('The try’s source scene has changed. Open the matching scene to label its simulated frames.');

  return { ...rebuilt, meshes };
}
