import type { SceneDocument } from './useSceneDocument';
import type { Posing } from '../utils/usePosing';
import type { SimTraining } from './useSimTraining';
import type { TriesView } from './useTriesView';
import type { ShowToast, StudioShared } from './types';
import { useFrameLabels } from './useFrameLabels';
import { loadFrameLabelScene } from './frameLabelScene';

interface WorkspaceFrameLabelsOptions {
  scene: { sceneId: string };
  docs: SceneDocument;
  posing: Posing;
  simTraining: SimTraining;
  studio: StudioShared;
  workspaceId: string;
  triesView: TriesView;
  showToast: ShowToast;
}

export function useWorkspaceFrameLabels(options: WorkspaceFrameLabelsOptions) {
  const { scene, docs, posing, simTraining, studio, workspaceId, triesView, showToast } = options;

  return useFrameLabels({
    sceneFor: (stored) =>
      loadFrameLabelScene(stored, {
        sceneId: scene.sceneId,
        parts: docs.parts,
        project: docs.project,
        rig: posing.rig,
        sim: simTraining.sim,
        cases: simTraining.cases.cases,
        partners: () => studio.robotsBeside(workspaceId),
      }),
    showDataset: triesView.openDataset,
    showToast,
  });
}
