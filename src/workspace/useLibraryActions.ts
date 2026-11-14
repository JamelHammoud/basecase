import { confirmAction } from '../design-system/confirmStore';
import type { CustomModelDefinition } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import { withModel, withoutModel } from '../utils/modelList';
import { platformBridge } from '../utils/platformBridge';
import { copyName, modelId, stamp } from './helpers';
import { sceneModel } from './libraryModels';
import type { WorkspaceCore } from './useWorkspaceCore';

function useLibraryModels({ studio, showToast }: WorkspaceCore) {
  'use memo';

  const { setCustomModels } = studio;

  const write = (save: () => Promise<unknown>, failed: string) =>
    save().catch(async (err: unknown) => {
      showToast(`${failed} ${errorMessage(err)}`, { tone: 'error' });
      setCustomModels(await platformBridge.listModels());
    });

  const resaveModel = (model: CustomModelDefinition) => {
    setCustomModels((models) => withModel(models, model));
    void write(() => platformBridge.saveModel(model), `Couldn’t save ${model.name}.`);
  };

  const renameModel = (model: CustomModelDefinition, name: string) => resaveModel({ ...model, name });

  const duplicateModel = (model: CustomModelDefinition) => {
    const name = copyName(
      model.name,
      studio.customModels.map((m) => m.name),
    );

    resaveModel({ ...model, id: modelId(), name, createdAt: stamp() });
  };

  const removeModel = (model: CustomModelDefinition) => {
    setCustomModels((models) => withoutModel(models, model.id));
    void write(() => platformBridge.deleteModel(model.id), `Couldn’t delete ${model.name}.`);
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

    if (sourceParts.length === 0) return;

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
