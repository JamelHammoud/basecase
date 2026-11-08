import type { Command } from '../components/CommandPalette';
import { RoutinesIcon } from '../design-system';
import type { CommandInputs } from './sceneCommands';

export function routineCommands({ core }: CommandInputs): Command[] {
  return [
    {
      id: 'show-routines',
      group: 'Panels',
      label: 'Show Routines',
      icon: <RoutinesIcon className="w-4 h-4" />,
      keywords: 'routine flow flowchart behaviour behavior reaction sentence',
      run: () => {
        core.tool.setLeftTab('routines');
        core.studio.setIsLeftOpen(true);
      },
    },
  ];
}
