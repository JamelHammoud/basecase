import type { SavedSceneRecord, SavedSceneSummary } from '../types/robotics';
import { CASE_STORES } from '../cases/console/codeStore';
import { pickFiles } from '../utils/pickFiles';
import { platformBridge } from '../utils/platformBridge';
import { errorMessage } from '../utils/errorMessage';
import { decodeSceneFile, SCENE_FILE_EXTENSION } from '../utils/sceneFile';
import { newSceneId } from '../utils/sceneIds';
import { sceneStore } from '../utils/sceneStore';
import { queueSceneWrite } from '../utils/sceneWrites';
import { findSceneTab, sceneCopyName } from './tabModel';
import type { useTabActions } from './useTabActions';
import type { TabsCore } from './useTabs';

async function rewrite(id: string, changes: Partial<SavedSceneRecord> & { keepUpdatedAt?: boolean }) {
  const record = await platformBridge.getScene(id);

  if (!record?.id) return null;

  return platformBridge.saveScene({ ...record, ...changes });
}

const reloadScenes = async () => sceneStore.set(await platformBridge.listScenes());

const listed = (id: string) => sceneStore.get().some((s) => s.id === id);

const keep = (saved: SavedSceneSummary | null) => {
  if (!saved) return reloadScenes();

  if (listed(saved.id)) sceneStore.upsert(saved);
};

export function useSceneLibrary(core: TabsCore, actions: ReturnType<typeof useTabActions>) {
  'use memo';

  const { latestRef, handles, setClosed, toastInFront } = core;
  const { renameTab, closeTabs, openScene } = actions;

  const tabFor = (sceneId: string) => {
    const { tabs, metas } = latestRef.current;

    return findSceneTab(tabs, metas, sceneId);
  };

  const renameScene = (scene: SavedSceneSummary, name: string) => {
    const tab = tabFor(scene.id);

    sceneStore.upsert({ ...scene, name });

    if (tab) {
      renameTab(tab.id, name);

      return;
    }

    queueSceneWrite(scene.id, () => rewrite(scene.id, { name, keepUpdatedAt: true })).then(keep, reloadScenes);
  };

  const duplicateScene = (scene: SavedSceneSummary) => {
    const tab = tabFor(scene.id);
    const id = newSceneId();
    const name = sceneCopyName(
      scene.name,
      latestRef.current.metas,
      sceneStore.get().map((s) => s.name),
    );

    sceneStore.upsert({ ...scene, id, name, updatedAt: new Date().toISOString() });

    queueSceneWrite(id, async () => {
      if (tab) await handles.current.get(tab.id)?.flush();

      return rewrite(scene.id, { id, name, chatId: null });
    }).then(keep, reloadScenes);
  };

  const deleteScene = (scene: SavedSceneSummary) => {
    const tab = tabFor(scene.id);

    if (tab) closeTabs([tab.id], true);

    setClosed((prev) => prev.filter((c) => c.seed.sceneId !== scene.id));
    sceneStore.remove(scene.id);
    CASE_STORES.deleteScene(scene.id);
    queueSceneWrite(scene.id, () => platformBridge.deleteScene(scene.id)).catch(reloadScenes);
    window.setTimeout(() => toastInFront(`Deleted ${scene.name}`), 0);
  };

  const importSceneFile = async (file: File) => {
    try {
      const scene = await decodeSceneFile(new Uint8Array(await file.arrayBuffer()));
      const summary = await platformBridge.saveScene({ ...scene, id: newSceneId() });

      sceneStore.upsert(summary);
      openScene(summary);
    } catch (err) {
      toastInFront(`Couldn’t open ${file.name}. ${errorMessage(err)}`, { tone: 'error' });
    }
  };

  const openSceneFile = async () => {
    const [file] = await pickFiles(`.${SCENE_FILE_EXTENSION}`);

    if (file) await importSceneFile(file);
  };

  return { renameScene, duplicateScene, deleteScene, importSceneFile, openSceneFile };
}

export type SceneLibrary = ReturnType<typeof useSceneLibrary>;
