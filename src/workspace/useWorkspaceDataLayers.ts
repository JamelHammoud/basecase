import type { DataLayerStore } from '../dataLayers/store';
import { useDataLayers } from './useDataLayers';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useWorkspaceDataLayers({
  simTraining,
  parts,
  viewportRef,
  tool,
  studio,
  showToast,
}: Pick<WorkspaceCore, 'simTraining' | 'parts' | 'viewportRef' | 'tool' | 'studio' | 'showToast'>): DataLayerStore {
  return useDataLayers({
    sim: simTraining.sim,
    timeline: simTraining.cases.timeline,
    parts,
    viewportRef,
    world: {
      builder: simTraining.cases.builder,
      showCases: () => {
        tool.setLeftTab('cases');
        studio.setIsLeftOpen(true);
      },
      failed: (message) => showToast(message, { tone: 'error' }),
    },
  });
}
