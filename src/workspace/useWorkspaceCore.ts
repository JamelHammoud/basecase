import { useScenePrinting } from './usePrinting';
import { useRef, useState } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { newSceneId } from '../utils/sceneIds';
import { usePosing } from '../utils/usePosing';
import { projectFromSeed } from './helpers';
import type { SceneWorkspaceProps, WorkspaceSeed } from './types';
import { useAnnotations } from './useAnnotations';
import { useMarks, useMarkState } from './useMarks';
import { useMeasure } from './useMeasure';
import { usePoseScope } from './usePoseScope';
import { useCadCompile } from './useCadCompile';
import { useRobotUpgrade } from './useRobotUpgrade';
import { useSceneDocument } from './useSceneDocument';
import { useSelectionActions } from './useSelectionActions';
import { useSimTraining } from './useSimTraining';
import { useCaseCompare } from './useCaseCompare';
import { useCaseExplore } from './useCaseExplore';
import { useToast } from './useToast';
import { useToolMode } from './useToolMode';
import { useDataLayers } from './useDataLayers';
import { useCaseRun } from './useCaseRun';
import { useTriesMode } from './useTriesMode';
import { useSceneGuide } from './useSceneGuide';
import { useReadiness } from './useReadiness';
import { useSketchSession } from './useSketchSession';
import { useRobotSync } from './useRobotSync';

function useSceneMeta(seed?: WorkspaceSeed) {
  const [sceneId, setSceneId] = useState<string>(() => seed?.sceneId ?? newSceneId());
  const [sceneName, setSceneName] = useState<string>(seed?.sceneName ?? 'Untitled');
  const [globalGoal, setGlobalGoal] = useState<string>(seed?.globalGoal ?? '');
  const [initial] = useState({ sceneId, sceneName });

  return { sceneId, setSceneId, sceneName, setSceneName, globalGoal, setGlobalGoal, initial };
}

interface SeedTargets {
  guide: { cancel: () => void };
  buildAlong: { close: () => void };
  scene: Pick<ReturnType<typeof useSceneMeta>, 'setSceneId' | 'setSceneName' | 'setGlobalGoal'>;
  docs: Pick<ReturnType<typeof useSceneDocument>, 'setProject' | 'resetDoc'>;
  annotations: { reset: (annotations: NonNullable<WorkspaceSeed['annotations']>) => void };
  setSelectedIds: (ids: string[]) => void;
  tool: { leaveSceneView: () => void };
  showToast: (message: string) => void;
}

const seedLoader = (to: SeedTargets) => (next: WorkspaceSeed, message?: string) => {
  to.guide.cancel();
  to.buildAlong.close();
  to.scene.setSceneId(next.sceneId);
  to.scene.setSceneName(next.sceneName);
  to.scene.setGlobalGoal(next.globalGoal || '');
  to.docs.setProject(projectFromSeed(next.project));
  to.docs.resetDoc(next.parts || []);
  to.annotations.reset(next.annotations || []);
  to.setSelectedIds([]);
  to.tool.leaveSceneView();

  if (message) to.showToast(message);
};

export function useWorkspaceCore({ workspaceId, active, seed, studio }: SceneWorkspaceProps) {
  const viewportRef = useRef<Viewport3DHandle | null>(null);
  const scene = useSceneMeta(seed);
  const docs = useSceneDocument(seed);
  const { parts, project, projectRef } = docs;
  const toasts = useToast(studio.openSettings);
  const { showToast } = toasts;

  useRobotUpgrade(docs, showToast);
  useCadCompile(docs);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const measure = useMeasure();
  const { setMeasuring } = measure;
  const markState = useMarkState();
  const { setMarking } = markState;
  const annotations = useAnnotations({
    initial: seed?.annotations ?? [],
    parts,
    showToast,
    setSelectedIds,
    stopTools: () => {
      setMeasuring(false);
      setMarking(false);
    },
  });
  const tool = useToolMode({
    setIsRightOpen: studio.setIsRightOpen,
    annotations,
    measure,
    mark: { marking: markState.marking, setMarking },
  });
  const marks = useMarks({ docs, showToast, selection: markState.selection, tool: markState.tool });
  const posing = usePosing({
    parts,
    project,
    projectRef,
    setProject: docs.setProject,
    viewportRef,
    selectedIds,
    transformMode: tool.transformMode,
    onPoseEdit: docs.recordPoseEdit,
  });
  const { onRobot, skeleton, posable } = usePoseScope({
    posing,
    docs,
    panels: { tool, annotations, isRightOpen: studio.isRightOpen, sculptEnabled: studio.sculptEnabled },
  });

  const simTraining = useSimTraining({ workspaceId, scene, docs, posing, viewportRef, showToast, studio });

  useRobotSync({ active, project, training: simTraining });

  const { guide, buildAlong } = useSceneGuide({ sceneName: scene.sceneName, docs, showToast, viewportRef });
  const selection = useSelectionActions({
    parts,
    selectedIds,
    setSelectedIds,
    transformMode: tool.transformMode,
    rig: posing.rig,
    showReferenceImages: studio.showReferenceImages,
  });

  const dataLayers = useDataLayers({ sim: simTraining.sim, timeline: simTraining.cases.timeline, parts, viewportRef });
  const caseRun = useCaseRun({ viewportRef, selectedIds, setSelectedIds, simTraining });

  const { travel } = docs;
  const undo = () => travel({ direction: 'undo', codeOnly: caseRun.open }, posing.restorePose);
  const loadSeed = seedLoader({ guide, buildAlong, scene, docs, annotations, setSelectedIds, tool, showToast });

  const { printer, printing } = useScenePrinting({ scene, docs, studio, tool, viewportRef, showToast, undo, guide });

  const readiness = useReadiness({ parts, project, printer, partsRef: docs.partsRef, projectRef, viewportRef });
  const caseCompare = useCaseCompare({
    inFront: active,
    kase: simTraining.cases.active,
    fingerprint: readiness.fingerprint,
    studio,
    source: { workspaceId, sceneName: scene.sceneName, docs, viewportRef },
    showToast,
  });
  const caseExplore = useCaseExplore({
    kase: simTraining.cases.active,
    parts,
    project,
    source: { workspaceId, sceneName: scene.sceneName, docs, viewportRef },
    showToast,
  });

  return {
    workspaceId,
    studio,
    printer,
    readiness,
    caseCompare,
    caseExplore,
    printing,
    viewportRef,
    scene,
    docs,
    parts,
    project,
    toasts,
    showToast,
    selectedIds,
    setSelectedIds,
    selection,
    sketching: useSketchSession({ docs, viewportRef, selectedIds, setSelectedIds, tool }),
    annotations,
    marks,
    measure,
    tool,
    posing,
    onRobot,
    posable,
    skeleton,
    simTraining,
    dataLayers,
    caseRun,
    tries: useTriesMode({ caseId: simTraining.cases.active?.id ?? null, caseRunning: caseRun.open }),
    guide,
    buildAlong,
    undo,
    redo: () => travel({ direction: 'redo', codeOnly: caseRun.open }, posing.restorePose),
    loadSeed,
  };
}

export type WorkspaceCore = ReturnType<typeof useWorkspaceCore>;
