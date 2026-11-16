import { restoreWorldAssets } from '../cases/worldAssets';
import { platformBridge } from '../utils/platformBridge';
import { sceneJson } from '../utils/sceneJson';
import { sceneStore } from '../utils/sceneStore';
import { queueSceneWrite } from '../utils/sceneWrites';
import { newSceneId } from '../utils/sceneIds';
import { projectFromSeed, copyName } from '../workspace/helpers';
import { rememberHistory, versionRequest } from '../workspace/versionClient';
import type { WorkspaceSeed } from '../workspace/types';

export async function branchScene(seed: WorkspaceSeed, names: string[]): Promise<WorkspaceSeed> {
  const design = {
    parts: seed.parts,
    project: projectFromSeed(seed.project),
    annotations: seed.annotations,
    globalGoal: seed.globalGoal,
  };
  const captured = await versionRequest({
    action: 'capture',
    history: seed.history,
    scene: await sceneJson(design),
    label: 'Branch point',
  });

  rememberHistory(captured.history, captured.quoted);
  sceneStore.upsert(
    await queueSceneWrite(seed.sceneId, async () =>
      platformBridge.saveSceneJson(
        await sceneJson({
          ...design,
          id: seed.sceneId,
          name: seed.sceneName,
          chatId: seed.chat?.chatId,
          history: captured.history,
        }),
      ),
    ),
  );

  return openVersionBranch({
    history: captured.history,
    id: captured.head!,
    sceneId: seed.sceneId,
    sceneName: seed.sceneName,
    names,
  });
}

export async function openVersionBranch(options: {
  history: string;
  id: string;
  sceneId: string;
  sceneName: string;
  names: string[];
}): Promise<WorkspaceSeed> {
  const branched = await versionRequest({
    action: 'branch',
    history: options.history,
    id: options.id,
    sceneId: options.sceneId,
  });
  const design = branched.scene!;

  await restoreWorldAssets(design.worldAssets);

  const sceneId = newSceneId();
  const sceneName = copyName(options.sceneName, [...options.names, ...sceneStore.get().map((entry) => entry.name)]);

  rememberHistory(branched.history, branched.quoted);
  sceneStore.upsert({
    id: sceneId,
    name: sceneName,
    globalGoal: design.globalGoal,
    partCount: design.parts.length,
    updatedAt: new Date().toISOString(),
  });

  try {
    sceneStore.upsert(
      await platformBridge.saveSceneJson(
        await sceneJson({ ...design, id: sceneId, name: sceneName, history: branched.history }),
      ),
    );
  } catch (error) {
    sceneStore.remove(sceneId);

    throw error;
  }

  return { ...design, sceneId, sceneName, history: branched.history, unsaved: false };
}
