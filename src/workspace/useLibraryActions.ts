import { scenePreview } from '../three/scenePreview';
import type { CustomModelDefinition, SavedSceneRecord, SavedSceneSummary } from '../types/robotics';
import { buildAIHandoffPayload } from '../utils/aiHandoff';
import { platformBridge } from '../utils/platformBridge';
import { newSceneId } from '../utils/sceneIds';
import { copyName, modelId, stamp } from './helpers';
import { sceneModel } from './libraryModels';
import type { WorkspaceCore } from './useWorkspaceCore';

function useLibraryScenes({ scene, parts, annotations, project, studio, showToast, viewportRef }: WorkspaceCore) {
  'use memo';

  const { setSavedScenes, renameTab } = studio;
  const { setSceneId } = scene;

  const saveScene = async () => {
    const screenshot = viewportRef.current?.captureScreenshot() || '';
    const { sceneId, sceneName, globalGoal } = scene;
    const { spec, markdown } = buildAIHandoffPayload(sceneName, globalGoal, parts, annotations.annotations);
    const saved = await platformBridge.saveScene({
      id: sceneId,
      name: sceneName,
      globalGoal,
      parts,
      annotations: annotations.annotations,
      project,
      thumbnailDataUrl: screenshot,
      ...(await scenePreview(parts)),
      spec,
      markdown,
    });

    setSceneId(saved.id);
    setSavedScenes(await platformBridge.listScenes());

    return saved;
  };

  const sync = async () => {
    try {
      showToast('Saving…', { tone: 'progress' });
      await saveScene();
      showToast(`Saved ${scene.sceneName}`);
    } catch (err) {
      showToast(`Couldn’t save. ${String(err)}`, { tone: 'error' });
    }
  };

  const resaveScene = async (record: SavedSceneRecord) => {
    await platformBridge.saveScene({ ...record, thumbnailDataUrl: undefined });
    setSavedScenes(await platformBridge.listScenes());
  };

  const resaveLibraryScene = async (summary: SavedSceneSummary, changes: Partial<SavedSceneRecord>) => {
    const record = await platformBridge.getScene(summary.id);

    if (record) await resaveScene({ ...record, ...changes });
  };

  const renameScene = async (record: SavedSceneSummary, name: string) => {
    const tab = studio.tabs.find((t) => t.sceneId === record.id);

    if (tab) renameTab(tab.id, name);

    await resaveLibraryScene(record, { name });
    showToast(`Renamed to ${name}`);
  };

  const duplicateScene = async (record: SavedSceneSummary) => {
    const name = copyName(
      record.name,
      studio.savedScenes.map((s) => s.name),
    );

    await resaveLibraryScene(record, { id: newSceneId(), name });
    showToast(`Duplicated ${record.name}`);
  };

  const deleteScene = async (summary: SavedSceneSummary) => {
    const record = await platformBridge.getScene(summary.id);

    setSavedScenes(await platformBridge.deleteScene(summary.id));
    showToast(`Deleted ${summary.name}`, {
      tone: 'neutral',
      action: { label: 'Undo', onClick: () => void (record && resaveScene(record)) },
    });
  };

  return { sync, renameScene, duplicateScene, deleteScene };
}

function useLibraryModels({ studio, showToast }: WorkspaceCore) {
  'use memo';

  const { setCustomModels } = studio;

  const resaveModel = async (model: CustomModelDefinition) => {
    await platformBridge.saveModel(model);
    setCustomModels(await platformBridge.listModels());
  };

  const renameModel = async (model: CustomModelDefinition, name: string) => {
    await resaveModel({ ...model, name });
    showToast(`Renamed to ${name}`);
  };

  const duplicateModel = async (model: CustomModelDefinition) => {
    const name = copyName(
      model.name,
      studio.customModels.map((m) => m.name),
    );

    await resaveModel({ ...model, id: modelId(), name, createdAt: stamp() });
    showToast(`Duplicated ${model.name}`);
  };

  const deleteModel = async (model: CustomModelDefinition) => {
    setCustomModels(await platformBridge.deleteModel(model.id));
    showToast(`Deleted ${model.name}`, {
      tone: 'neutral',
      action: { label: 'Undo', onClick: () => void resaveModel(model) },
    });
  };

  return { renameModel, duplicateModel, deleteModel };
}

export function useLibraryActions(core: WorkspaceCore) {
  const { parts, selection, scene, studio, showToast, tool, viewportRef } = core;
  const { setCustomModels, setIsLeftOpen } = studio;
  const { setLeftTab } = tool;
  const scenes = useLibraryScenes(core);
  const models = useLibraryModels(core);

  const saveAsModel = async (mode: 'selected' | 'all') => {
    const { selectedParts, selectedPart } = selection;
    const useSelection = mode === 'selected' && selectedParts.length > 0;
    const sourceParts = useSelection ? selectedParts : parts.filter((p) => p.visible);

    if (sourceParts.length === 0) {
      showToast('Add or select a part first', { tone: 'error' });

      return;
    }

    const single = mode === 'selected' && selectedParts.length === 1 ? selectedPart : null;
    const saved = await platformBridge.saveModel(
      sceneModel({
        sourceParts,
        single,
        sceneName: scene.sceneName,
        screenshot: () => viewportRef.current?.captureScreenshot(),
      }),
    );

    setCustomModels(await platformBridge.listModels());
    setIsLeftOpen(true);
    setLeftTab('library');
    showToast(`Saved ${saved.name} to Library`);
  };

  return { ...scenes, ...models, saveAsModel };
}

export type LibraryActions = ReturnType<typeof useLibraryActions>;
