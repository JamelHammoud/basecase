import type { SavedSceneRecord, SavedSceneSummary } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { newSceneId } from '../utils/sceneIds';
import { sceneStore } from '../utils/sceneStore';
import { copyName } from '../workspace/helpers';
import { findSceneTab } from './tabModel';
import type { useTabActions } from './useTabActions';
import type { TabsCore } from './useTabs';

async function rewrite(id: string, changes: Partial<SavedSceneRecord> & { keepUpdatedAt?: boolean }) {
  const record = await platformBridge.getScene(id);

  if (!record?.id) return null;

  return platformBridge.saveScene({ ...record, ...changes });
}

export function useSceneLibrary(core: TabsCore, actions: ReturnType<typeof useTabActions>) {
  'use memo';

  const { latestRef, handles, setClosed, toastInFront } = core;
  const { renameTab, closeTabs } = actions;

  const tabFor = (sceneId: string) => {
    const { tabs, metas } = latestRef.current;

    return findSceneTab(tabs, metas, sceneId);
  };

  const renameScene = async (scene: SavedSceneSummary, name: string) => {
    const tab = tabFor(scene.id);

    sceneStore.upsert({ ...scene, name });

    if (tab) {
      renameTab(tab.id, name);

      return;
    }

    sceneStore.upsert(await rewrite(scene.id, { name, keepUpdatedAt: true }));
  };

  const duplicateScene = async (scene: SavedSceneSummary) => {
    const tab = tabFor(scene.id);

    if (tab) await handles.current.get(tab.id)?.flush();

    const name = copyName(
      scene.name,
      sceneStore.get().map((s) => s.name),
    );

    sceneStore.upsert(await rewrite(scene.id, { id: newSceneId(), name, chatId: null }));
    toastInFront(`Duplicated ${scene.name}`);
  };

  const deleteScene = async (scene: SavedSceneSummary) => {
    const tab = tabFor(scene.id);

    if (tab) closeTabs([tab.id], true);

    setClosed((prev) => prev.filter((c) => c.seed.sceneId !== scene.id));
    sceneStore.remove(scene.id);
    sceneStore.set(await platformBridge.deleteScene(scene.id));
    window.setTimeout(() => toastInFront(`Deleted ${scene.name}`), 0);
  };

  return { renameScene, duplicateScene, deleteScene };
}

export type SceneLibrary = ReturnType<typeof useSceneLibrary>;
