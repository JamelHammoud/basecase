import type { CustomModelDefinition } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { copyName, modelId, stamp } from './helpers';
import { sceneModel } from './libraryModels';
import type { WorkspaceCore } from './useWorkspaceCore';

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

  return { ...models, saveAsModel };
}

export type LibraryActions = ReturnType<typeof useLibraryActions>;
