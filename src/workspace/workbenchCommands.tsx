import { EditIcon } from '../design-system';
import type { Command } from '../components/CommandPalette';
import type { WorkspaceCore } from './useWorkspaceCore';

export function workbenchCommands(core: WorkspaceCore): Command[] {
  const { workbench } = core.simTraining.cases;

  if (!workbench.available) return [];

  return [
    {
      id: 'case-workbench-placement',
      group: 'Simulate',
      label: 'Edit Workbench Placement',
      icon: <EditIcon />,
      keywords: 'robot base bench measured translation yaw unit rehearse',
      run: () => {
        core.tool.setRightTab('sim');
        workbench.show();
      },
    },
  ];
}
