import type { Command } from '../components/CommandPalette';
import { CasesIcon, PlusIcon, RotateLeftIcon, RunIcon, StopIcon } from '../design-system';
import type { CommandInputs } from './sceneCommands';
import type { WorkspaceCore } from './useWorkspaceCore';

const ic = 'w-4 h-4';

const showCases = (core: WorkspaceCore) => {
  core.tool.setLeftTab('cases');
  core.studio.setIsLeftOpen(true);
};

export const showNewCase = (core: WorkspaceCore) => {
  showCases(core);
  core.simTraining.cases.builder.start();
};

export function caseCommands({ core }: CommandInputs): Command[] {
  const { simTraining, posing, tool } = core;
  const { sim, cases } = simTraining;

  if (!posing.hasRig) return [];

  const drive: Command = sim.drive.active
    ? {
        id: 'drive-stop',
        group: 'Simulate',
        label: 'Stop Driving',
        shortcut: 'Esc',
        icon: <StopIcon className={ic} />,
        run: sim.drive.stop,
      }
    : {
        id: 'drive-start',
        group: 'Simulate',
        label: 'Drive',
        icon: <RunIcon className={ic} />,
        keywords: 'keyboard gamepad play joystick',
        run: () => {
          tool.setRightTab('sim');
          void sim.drive.start();
        },
      };
  const respawn: Command[] = sim.drive.active
    ? [
        {
          id: 'drive-respawn',
          group: 'Simulate',
          label: 'Start Over',
          shortcut: 'R',
          icon: <RotateLeftIcon className={ic} />,
          keywords: 'respawn reset fell',
          run: sim.drive.respawn,
        },
      ]
    : [];
  const tryIt: Command[] = cases.active
    ? [
        {
          id: 'case-try',
          group: 'Simulate',
          label: `Try ${cases.active.name}`,
          icon: <RunIcon className={ic} />,
          keywords: 'case attempt play',
          run: () => {
            tool.setRightTab('sim');
            void cases.attempt.start();
          },
        },
      ]
    : [];

  const newCase: Command[] = cases.builder.goals.length
    ? [
        {
          id: 'new-case',
          group: 'Simulate',
          label: 'New Case',
          icon: <PlusIcon className={ic} />,
          keywords: 'case challenge world goal level make create',
          run: () => showNewCase(core),
        },
      ]
    : [];

  return [
    {
      id: 'show-cases',
      group: 'Panels',
      label: 'Show Cases',
      icon: <CasesIcon className={ic} />,
      keywords: 'challenge world goal level',
      run: () => showCases(core),
    },
    ...newCase,
    drive,
    ...respawn,
    ...tryIt,
  ];
}
