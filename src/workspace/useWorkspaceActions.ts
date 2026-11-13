import { useCadTune } from './useCadTune';
import { useExportActions } from './useExportActions';
import { useFileImport } from './useFileImport';
import { useFixedCameras } from './useFixedCameras';
import { useHandJoints } from './useHandJoints';
import { useLibraryActions } from './useLibraryActions';
import { useMirror } from './useMirror';
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
  const robots = useRobotInsert(core, pose.openPose);
  const creation = usePartCreation(core, robots);
  const files = useFileImport(core, { creation, robots, pose });
  const edits = usePartEdits(core);
  const ops = useSelectionOps(core);
  const mirror = useMirror(core);
  const tuning = useCadTune(core);
  const library = useLibraryActions(core);
  const exports = useExportActions(core);
  const joints = useHandJoints(core);
  const wrap = useWrapRobot(core);
  const onshape = useOnshapeUpdate(core);
  const cameras = useFixedCameras({
    project: core.project,
    updateProjectNow: core.docs.updateProjectNow,
    viewportRef: core.viewportRef,
    showToast: core.showToast,
  });

  return {
    pose,
    robots,
    creation,
    files,
    edits,
    ops,
    mirror,
    tuning,
    library,
    exports,
    cameras,
    joints,
    wrap,
    onshape,
  };
}

export type WorkspaceActions = ReturnType<typeof useWorkspaceActions>;
