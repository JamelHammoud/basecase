import { evaluationScenePhysics } from '../cases/evaluationReplayValidation';
import { decodeSceneFile } from '../utils/sceneFile';
import { newSceneId } from '../utils/sceneIds';
import { provideMeshFiles, componentMeshesReady } from '../three/componentMeshes';
import { tryArchiveWorker } from '../cases/tryArchiveClient';
import type { Recording } from '../sim/recorder';
import type { TryRecord } from '../cases/tries';
import type { ScenePart, ProjectSettings } from '../types/robotics';
import type { StudioShared } from './types';

export async function ensureEvaluationScene(
  studio: Pick<StudioShared, 'newScene'>,
  current: { parts: ScenePart[]; project: ProjectSettings },
  input: { record: TryRecord; recording: Recording },
): Promise<boolean> {
  const source = input.recording.evaluation;

  if (!source) return true;

  const matches = await tryArchiveWorker.call('evaluationScene', {
    scene: source.scene,
    parts: current.parts,
    physics: evaluationScenePhysics(current.project),
  });

  provideMeshFiles(Object.fromEntries(Object.entries(source.meshes).map(([id, bytes]) => [id, bytes.slice().buffer])));

  if ((await componentMeshesReady(Object.keys(source.meshes))).length) throw new Error('The robot mesh can’t be read.');

  if (matches) return true;

  const scene = await decodeSceneFile(source.scene);

  studio.newScene({
    sceneId: newSceneId(),
    sceneName: scene.name,
    globalGoal: scene.globalGoal,
    parts: scene.parts,
    annotations: scene.annotations,
    project: scene.project,
    openTry: input.record.id,
    unsaved: true,
  });

  return false;
}
