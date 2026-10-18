import { ImportRobotSheet } from '../components/ImportRobotSheet';
import { RetargetSheet } from '../components/RetargetSheet';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';

interface WorkspaceSheetsProps {
  core: WorkspaceCore;
  actions: WorkspaceActions;
}

export function WorkspaceSheets({ core, actions }: WorkspaceSheetsProps) {
  const { posing } = core;
  const { robots, pose } = actions;
  const { motionInputRef } = pose;
  const { importRobotFrom } = robots;

  return (
    <>
      <ImportRobotSheet
        open={robots.importRobotOpen}
        onClose={robots.closeImportRobot}
        onImport={(src) => void importRobotFrom(src)}
      />
      <RetargetSheet
        key={pose.motionSource?.name}
        source={pose.motionSource}
        rig={posing.robot?.rig ?? posing.rig}
        pointOf={posing.pointOf}
        onClose={pose.closeMotion}
        onCreate={pose.createAnimation}
      />
      <input
        ref={motionInputRef}
        type="file"
        accept=".bvh"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];

          e.target.value = '';
          void pose.readMotionFile(file);
        }}
      />
    </>
  );
}
