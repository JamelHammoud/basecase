import { useWorkspaceVersioning } from './useWorkspaceVersioning';
import { useVisionScope } from '../cameras/visionScope';
import { useScenePrinting } from './usePrinting';
import { useTriesWork } from './useDatasets';
import { useRef, useState } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { newSceneId } from '../utils/sceneIds';
import { usePosing } from '../utils/usePosing';
import { projectFromSeed } from './helpers';
import type { SceneWorkspaceProps, WorkspaceSeed } from './types';
import { useMarks } from './useMarks';
import { usePoseScope } from './usePoseScope';
import { useCadCompile } from './useCadCompile';
import { useRobotUpgrade } from './useRobotUpgrade';
import { useSceneDocument } from './useSceneDocument';
import { useSelectionActions } from './useSelectionActions';
import { useSimTraining } from './useSimTraining';
import { useWorkspaceStudies } from './useWorkspaceStudies';
import { useToast } from './useToast';
import { useWorkspaceDataLayers } from './useWorkspaceDataLayers';
import { useConsoleEditing } from './useConsoleEditing';
import { useCaseRun } from './useCaseRun';
import { useSceneGuide } from './useSceneGuide';
import { useSceneReadiness } from './useReadiness';
import { useSketchSession } from './useSketchSession';
import { useRobotSync } from './useRobotSync';
import { useRepair } from './useRepair';
import { useLatestRef } from '../utils/useLatestRef';
import { useWorkspaceTools } from './useWorkspaceTools';
import { useWorkspaceFrameLabels } from './useWorkspaceFrameLabels';

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

const resetStudyBeforeLoad =
  (study: { reset: () => void }, load: ReturnType<typeof seedLoader>) => (next: WorkspaceSeed, message?: string) => {
    study.reset();
    load(next, message);
  };

const versionSeedLoader =
  (versions: { reset: (history?: string) => void }, load: ReturnType<typeof seedLoader>) =>
  (next: WorkspaceSeed, message?: string) => {
    versions.reset(next.history);
    load(next, message);
  };

export function useWorkspaceCore({ workspaceId, active, seed, studio }: SceneWorkspaceProps) {
  const viewportRef = useRef<Viewport3DHandle | null>(null);
  const scene = useSceneMeta(seed);
  const docs = useSceneDocument(seed);
  const documentContext = { scene, docs, studio };
  const { parts, project, projectRef } = docs;
  const toasts = useToast(studio.openSettings);
  const { showToast } = toasts;

  useRobotUpgrade(docs, showToast);
  useCadCompile(docs);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { measure, markState, annotations, tool } = useWorkspaceTools({
    initial: seed?.annotations ?? [],
    parts,
    showToast,
    setSelectedIds,
    setIsRightOpen: studio.setIsRightOpen,
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

  useRobotSync({ active, sceneId: scene.sceneId, project, training: simTraining, showToast });

  const { guide, buildAlong } = useSceneGuide({ sceneName: scene.sceneName, docs, showToast, viewportRef });
  const selection = useSelectionActions({
    parts,
    selectedIds,
    setSelectedIds,
    transformMode: tool.transformMode,
    rig: posing.rig,
    showReferenceImages: studio.showReferenceImages,
  });

  const dataLayers = useWorkspaceDataLayers({ simTraining, parts, viewportRef, tool, studio, showToast });
  const caseRun = useCaseRun({ viewportRef, selectedIds, setSelectedIds, simTraining });
  const viewRef = useLatestRef({ active, tab: tool.leftTab, sidebarOpen: studio.isLeftOpen && !caseRun.open });
  const { triesView, datasets } = useTriesWork(simTraining, showToast);
  const frameLabels = useWorkspaceFrameLabels({
    scene,
    docs,
    posing,
    simTraining,
    studio,
    workspaceId,
    triesView,
    showToast,
  });

  const { restorePose } = posing;
  const historyOptions = { seed, annotations, restorePose, codeOnly: caseRun.open };
  const { versions, undo, redo } = useWorkspaceVersioning({ ...documentContext, ...historyOptions });
  const loadSeed = seedLoader({ guide, buildAlong, scene, docs, annotations, setSelectedIds, tool, showToast });

  const { printer, printing } = useScenePrinting({ scene, docs, studio, tool, viewportRef, showToast, undo, guide });
  const repair = useRepair({ ...docs, viewportRef, guide, buildAlong, printing });

  const readiness = useSceneReadiness(docs, printing, studio, viewportRef);
  const studyOptions = { active, workspaceId, viewportRef, readiness, simTraining, tool, showToast };
  const { caseCompare, study } = useWorkspaceStudies({ ...documentContext, ...studyOptions });

  return {
    active,
    versions,
    workspaceId,
    vision: useVisionScope(),
    studio,
    printer,
    readiness,
    caseCompare,
    study,
    printing,
    triesView,
    datasets,
    frameLabels,
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
    sketching: useSketchSession({ docs, viewportRef, selectedIds, setSelectedIds, tool, showToast }),
    annotations,
    marks,
    measure,
    tool,
    operateVisible: () => viewRef.current.active && viewRef.current.sidebarOpen && viewRef.current.tab === 'operate',
    posing,
    onRobot,
    posable,
    skeleton,
    simTraining,
    dataLayers,
    caseRun,
    consoleEditing: useConsoleEditing({ caseRun, docs, showToast }),
    guide,
    buildAlong,
    repair,
    undo,
    redo,
    loadSeed: versionSeedLoader(versions, resetStudyBeforeLoad(study, loadSeed)),
  };
}

export type WorkspaceCore = ReturnType<typeof useWorkspaceCore>;
