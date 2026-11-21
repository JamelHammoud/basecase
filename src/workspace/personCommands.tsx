import type { Command } from '../components/CommandPalette';
import { PlusIcon } from '../design-system';
import type { WorkspaceCore } from './useWorkspaceCore';

export function personCommands(core: WorkspaceCore): Command[] {
  const { people } = core.simTraining.cases;

  if (!people?.canAdd) return [];

  return [
    {
      id: 'add-case-person',
      group: 'Simulate',
      label: 'Add Person',
      icon: <PlusIcon />,
      keywords: 'world crossing route encounter',
      run: () => {
        core.tool.setRightTab('sim');
        people.add();
      },
    },
  ];
}
