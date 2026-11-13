import { useExportActions } from './useExportActions';
import { useFileImport } from './useFileImport';
import { useFixedCameras } from './useFixedCameras';
import { useLibraryActions } from './useLibraryActions';
import { usePartCreation } from './usePartCreation';
import { usePartEdits } from './usePartEdits';
import { usePoseActions } from './usePoseActions';
import { useRobotInsert } from './useRobotInsert';
import { useSelectionOps } from './useSelectionOps';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useWorkspaceActions(core: WorkspaceCore) {
  const pose = usePoseActions(core);
  const robots = useRobotInsert(core, pose.openPose);
  const creation = usePartCreation(core, robots);
  const files = useFileImport(core, { creation, robots, pose });
  const edits = usePartEdits(core);
  const ops = useSelectionOps(core);
  const library = useLibraryActions(core);
  const exports = useExportActions(core);
  const cameras = useFixedCameras({
    project: core.project,
    updateProjectNow: core.docs.updateProjectNow,
    viewportRef: core.viewportRef,
    showToast: core.showToast,
  });

  return { pose, robots, creation, files, edits, ops, library, exports, cameras };
}

export type WorkspaceActions = ReturnType<typeof useWorkspaceActions>;
