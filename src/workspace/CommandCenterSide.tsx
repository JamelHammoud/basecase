import { CommandCenterCameras } from '../components/commandCenter/CommandCenterCameras';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';

export function CommandCenterSide({ core, actions }: { core: WorkspaceCore; actions: WorkspaceActions }) {
  const { commandCenter, studio } = core;

  return (
    <CommandCenterCameras
      open={studio.isLeftOpen && commandCenter.layout.cameras}
      parts={core.parts}
      sim={core.simTraining.sim}
      cameras={actions.cameras}
      patchPart={actions.edits.patchPart}
    />
  );
}
