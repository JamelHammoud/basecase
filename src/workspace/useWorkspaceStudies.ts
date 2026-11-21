import { useCaseStudies } from './useCaseStudies';
import type { SceneCaseSource } from './useCaseCompare';
import type { SceneDocument } from './useSceneDocument';
import type { useSceneReadiness } from './useReadiness';
import type { useSimTraining } from './useSimTraining';
import type { useToolMode } from './useToolMode';
import type { ShowToast, StudioShared } from './types';

interface StudyOptions {
  active: boolean;
  workspaceId: string;
  scene: { sceneId: string; sceneName: string };
  docs: SceneDocument;
  viewportRef: SceneCaseSource['viewportRef'];
  readiness: ReturnType<typeof useSceneReadiness>;
  simTraining: ReturnType<typeof useSimTraining>;
  tool: ReturnType<typeof useToolMode>;
  studio: StudioShared;
  showToast: ShowToast;
}

export function useWorkspaceStudies(options: StudyOptions) {
  const { active, workspaceId, scene, docs, viewportRef, readiness, simTraining, tool, studio, showToast } = options;

  return useCaseStudies({
    inFront: active,
    sim: simTraining.sim,
    onShow: () => {
      tool.setRightTab('sim');
      studio.setIsRightOpen(true);
    },
    kase: simTraining.cases.active,
    fingerprint: readiness.fingerprint,
    studio,
    source: {
      fingerprint: () => readiness.fingerprint,
      workspaceId,
      sceneId: scene.sceneId,
      sceneName: scene.sceneName,
      docs,
      viewportRef,
    },
    parts: docs.parts,
    project: docs.project,
    showToast,
  });
}
