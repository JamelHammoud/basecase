import { DesignFromMotionSheet } from '../components/DesignFromMotionSheet';
import { RetargetSheet } from '../components/RetargetSheet';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';

export function MotionSheets({ core, actions }: { core: WorkspaceCore; actions: WorkspaceActions }) {
  const { posing } = core;
  const { pose, motionDesign } = actions;

  return (
    <>
      {motionDesign.motion && (
        <DesignFromMotionSheet
          motion={motionDesign.motion}
          busy={motionDesign.busy}
          problem={motionDesign.problem}
          onClose={motionDesign.close}
          onDesign={motionDesign.design}
        />
      )}
      {pose.motion && (
        <RetargetSheet
          motion={pose.motion}
          rig={posing.robot?.rig ?? posing.rig}
          pointOf={posing.pointOf}
          onClose={pose.closeMotion}
          onCreate={pose.createAnimation}
        />
      )}
    </>
  );
}
