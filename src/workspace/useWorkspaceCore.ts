import { useRef, useState } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { newSceneId } from '../utils/sceneIds';
import { usePosing } from '../utils/usePosing';
import { projectFromSeed } from './helpers';
import type { SceneWorkspaceProps, WorkspaceSeed } from './types';
import { useAnnotations } from './useAnnotations';
import { useMarks } from './useMarks';
import { usePanelSync } from './usePanelSync';
import { useRobotUpgrade } from './useRobotUpgrade';
import { useSceneDocument } from './useSceneDocument';
import { useSelectionActions } from './useSelectionActions';
import { useSimTraining } from './useSimTraining';
import { useToast } from './useToast';
import { useToolMode } from './useToolMode';
import { useBuildGuide } from './useBuildGuide';

function useSceneMeta(seed?: WorkspaceSeed) {
  const [sceneId, setSceneId] = useState<string>(() => seed?.sceneId ?? newSceneId());
  const [sceneName, setSceneName] = useState<string>(seed?.sceneName ?? 'Untitled');
  const [globalGoal, setGlobalGoal] = useState<string>(seed?.globalGoal ?? '');
  const [initial] = useState({ sceneId, sceneName });

  return { sceneId, setSceneId, sceneName, setSceneName, globalGoal, setGlobalGoal, initial };
}

export function useWorkspaceCore({ workspaceId, seed, studio }: Omit<SceneWorkspaceProps, 'active'>) {
  const viewportRef = useRef<Viewport3DHandle | null>(null);
  const scene = useSceneMeta(seed);
  const docs = useSceneDocument(seed);
  const { parts, project, projectRef } = docs;
  const toasts = useToast();
  const { showToast } = toasts;

  useRobotUpgrade(docs, showToast);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [measuring, setMeasuring] = useState(false);
  const [marking, setMarkingState] = useState(false);
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const setMarking = (on: boolean) => {
    setMarkingState(on);

    if (!on) setSelectedMarkId(null);
  };
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
    measure: { measuring, setMeasuring },
    mark: { marking, setMarking },
  });
  const marks = useMarks({
    docs,
    showToast,
    selection: { selectedId: selectedMarkId, setSelectedId: setSelectedMarkId },
  });
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
  const onRobot = posing.hasRig && !!posing.robot;

  usePanelSync({
    tool,
    annotations,
    isRightOpen: studio.isRightOpen,
    sculptEnabled: studio.sculptEnabled,
    onRobot,
    hasRig: posing.hasRig,
  });

  const simTraining = useSimTraining({ workspaceId, parts, project, setProject: docs.setProject, posing, viewportRef });
  const guide = useBuildGuide({
    sceneName: scene.sceneName,
    parts,
    project,
    partsRef: docs.partsRef,
    projectRef,
    updateProjectNow: docs.updateProjectNow,
    showToast,
  });
  const selection = useSelectionActions({
    parts,
    selectedIds,
    setSelectedIds,
    transformMode: tool.transformMode,
    rig: posing.rig,
    showReferenceImages: studio.showReferenceImages,
  });

  const { setSceneId, setSceneName, setGlobalGoal } = scene;
  const { setProject, resetDoc, travel } = docs;
  const { reset: resetAnnotations } = annotations;
  const { restorePose } = posing;

  const loadSeed = (next: WorkspaceSeed, message?: string) => {
    setSceneId(next.sceneId);
    setSceneName(next.sceneName);
    setGlobalGoal(next.globalGoal || '');
    setProject(projectFromSeed(next.project));
    resetDoc(next.parts || []);
    resetAnnotations(next.annotations || []);
    setSelectedIds([]);

    if (message) showToast(message);
  };

  return {
    workspaceId,
    studio,
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
    annotations,
    marks,
    tool,
    posing,
    onRobot,
    simTraining,
    guide,
    undo: () => travel('undo', restorePose),
    redo: () => travel('redo', restorePose),
    loadSeed,
  };
}

export type WorkspaceCore = ReturnType<typeof useWorkspaceCore>;
