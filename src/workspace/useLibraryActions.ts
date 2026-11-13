import { confirmAction } from '../design-system/confirmStore';
import type { CustomModelDefinition } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { copyName, modelId, stamp } from './helpers';
import { sceneModel, withModel } from './libraryModels';
import type { WorkspaceCore } from './useWorkspaceCore';

function useLibraryModels({ studio, showToast }: WorkspaceCore) {
  'use memo';

  const { setCustomModels } = studio;

  const write = (
    change: (models: CustomModelDefinition[]) => CustomModelDefinition[],
    save: () => Promise<unknown>,
  ) => {
    setCustomModels(change);
    save().catch(async () => setCustomModels(await platformBridge.listModels()));
  };

  const resaveModel = (model: CustomModelDefinition) =>
    write(
      (models) => withModel(models, model),
      () => platformBridge.saveModel(model),
    );

  const renameModel = (model: CustomModelDefinition, name: string) => {
    resaveModel({ ...model, name });
    showToast(`Renamed to ${name}`);
  };

  const duplicateModel = (model: CustomModelDefinition) => {
    const name = copyName(
      model.name,
      studio.customModels.map((m) => m.name),
    );

    resaveModel({ ...model, id: modelId(), name, createdAt: stamp() });
    showToast(`Duplicated ${model.name}`);
  };

  const removeModel = (model: CustomModelDefinition) => {
    write(
      (models) => models.filter((m) => m.id !== model.id),
      () => platformBridge.deleteModel(model.id),
    );
    showToast(`Deleted ${model.name}`, {
      tone: 'neutral',
      action: { label: 'Undo', onClick: () => resaveModel(model) },
    });
  };

  const deleteModel = (model: CustomModelDefinition) =>
    confirmAction({ title: `Delete ${model.name}?`, onConfirm: () => removeModel(model) });

  return { saveModel: resaveModel, renameModel, duplicateModel, deleteModel };
}

export function useLibraryActions(core: WorkspaceCore) {
  const { parts, selection, scene, studio, showToast, tool, viewportRef } = core;
  const { setIsLeftOpen } = studio;
  const { setLeftTab } = tool;
  const { saveModel, renameModel, duplicateModel, deleteModel } = useLibraryModels(core);

  const saveAsModel = (mode: 'selected' | 'all') => {
    const { selectedParts, selectedPart } = selection;
    const useSelection = mode === 'selected' && selectedParts.length > 0;
    const sourceParts = useSelection ? selectedParts : parts.filter((p) => p.visible);

    if (sourceParts.length === 0) {
      showToast('Add or select a part first', { tone: 'error' });

      return;
    }

    const single = mode === 'selected' && selectedParts.length === 1 ? selectedPart : null;
    const model = sceneModel({
      sourceParts,
      single,
      sceneName: scene.sceneName,
      screenshot: () => viewportRef.current?.captureScreenshot(),
    });

    saveModel(model);
    setIsLeftOpen(true);
    setLeftTab('library');
    showToast(`Saved ${model.name} to Library`);
  };

  return { renameModel, duplicateModel, deleteModel, saveAsModel };
}
