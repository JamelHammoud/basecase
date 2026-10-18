import { useExportActions } from './useExportActions';
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
  const edits = usePartEdits(core);
  const ops = useSelectionOps(core);
  const library = useLibraryActions(core);
  const exports = useExportActions(core);

  return { pose, robots, creation, edits, ops, library, exports };
}

export type WorkspaceActions = ReturnType<typeof useWorkspaceActions>;
