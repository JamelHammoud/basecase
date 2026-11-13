import { CommandCenterPanels } from '../components/commandCenter/CommandCenterPanels';
import type { WorkspaceCore } from './useWorkspaceCore';
import { useTryGoal } from './useTryGoal';

export function CommandCenterColumn({ core }: { core: WorkspaceCore }) {
  const { commandCenter, studio, simTraining, posing, parts, tool } = core;
  const { sim, cases } = simTraining;
  const failed = useTryGoal({ sim, cases, rig: posing.rig, parts });

  return (
    <CommandCenterPanels
      open={studio.isRightOpen}
      width={studio.panelWidths.right}
      column={commandCenter.layout.column}
      cases={cases}
      sim={sim}
      parts={parts}
      failed={failed}
      joints={core.project.joints ?? []}
      onBrowseRobots={() => {
        commandCenter.leave();
        tool.setLeftTab('robots');
        studio.setIsLeftOpen(true);
      }}
      onDone={commandCenter.leave}
    />
  );
}
