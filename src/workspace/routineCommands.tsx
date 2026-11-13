import type { Command } from '../components/CommandPalette';
import { PlusIcon, RoutinesIcon, RunIcon } from '../design-system';
import type { CommandInputs } from './sceneCommands';
import { showLeftTab } from './showView';
import { keyFor } from '../app/shortcuts';

const KEYWORDS = 'routine flow flowchart behaviour behavior reaction sentence';

export function routineCommands({ core }: CommandInputs): Command[] {
  const routines = core.simTraining.routines;
  const { store, editor, view } = routines;
  const show = () => showLeftTab(core, 'routines');
  const editing: Command[] = view.routine
    ? [
        {
          id: 'add-routine-step',
          group: 'Routines',
          label: 'Add Step',
          icon: <PlusIcon className="w-4 h-4" />,
          keywords: `${KEYWORDS} step drive turn say wait if`,
          run: () => {
            show();
            editor.addHere();
          },
        },
      ]
    : [];
  const running: Command[] = view.compiled?.ok
    ? [
        {
          id: 'run-routine',
          group: 'Routines',
          label: 'Run Routine',
          icon: <RunIcon className="w-4 h-4" />,
          shortcut: keyFor('run-routine'),
          keywords: `${KEYWORDS} play simulate`,
          run: () => {
            show();
            void routines.run();
          },
        },
      ]
    : [];

  return [
    {
      id: 'show-routines',
      group: 'Panels',
      label: 'Show Routines',
      icon: <RoutinesIcon className="w-4 h-4" />,
      keywords: KEYWORDS,
      run: show,
    },
    {
      id: 'new-routine',
      group: 'Routines',
      label: 'New Routine',
      icon: <PlusIcon className="w-4 h-4" />,
      keywords: KEYWORDS,
      run: () => {
        show();
        store.create();
      },
    },
    ...editing,
    ...running,
  ];
}
