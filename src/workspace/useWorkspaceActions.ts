import { useArmSizing } from './useArmSizing';
import { useCadTune } from './useCadTune';
import { useDataImport } from './useDataImport';
import { useEarthPlace } from './useEarthPlace';
import { useExportActions } from './useExportActions';
import { useFileImport } from './useFileImport';
import { useFixedCameras } from './useFixedCameras';
import { useHandJoints } from './useHandJoints';
import { useLibraryActions } from './useLibraryActions';
import { useMirror } from './useMirror';
import { useMotionDesign } from './useMotionDesign';
import { useOnshapeUpdate } from './useOnshapeUpdate';
import { usePartCreation } from './usePartCreation';
import { usePartEdits } from './usePartEdits';
import { usePoseActions } from './usePoseActions';
import { useRobotInsert } from './useRobotInsert';
import { useSelectionOps } from './useSelectionOps';
import type { WorkspaceCore } from './useWorkspaceCore';
import { useWrapRobot } from './useWrapRobot';

export function useWorkspaceActions(core: WorkspaceCore) {
  const pose = usePoseActions(core);
  const motion = useMotionDesign(core, pose);
  const robots = useRobotInsert(core, pose.openPose);
  const creation = usePartCreation(core, robots);
  const data = useDataImport(core, robots);
  const files = useFileImport(core, { creation, pose, data });
  const edits = usePartEdits(core);
  const ops = useSelectionOps(core);
  const mirror = useMirror(core);
  const tuning = useCadTune(core);
  const library = useLibraryActions(core);
  const exports = useExportActions(core);
  const joints = useHandJoints(core);
  const wrap = useWrapRobot(core);
  const onshape = useOnshapeUpdate(core);
  const arm = useArmSizing(core);
  const cameras = useFixedCameras({
    project: core.project,
    updateProjectNow: core.docs.updateProjectNow,
    viewportRef: core.viewportRef,
    showToast: core.showToast,
  });
  const earth = useEarthPlace({
    project: core.project,
    updateProjectNow: core.docs.updateProjectNow,
    openSettings: core.studio.openSettings,
    showToast: core.showToast,
  });

  return {
    pose,
    motion,
    robots,
    creation,
    files,
    data,
    edits,
    ops,
    mirror,
    tuning,
    library,
    exports,
    cameras,
    earth,
    joints,
    wrap,
    onshape,
    arm,
  };
}

export type WorkspaceActions = ReturnType<typeof useWorkspaceActions>;
