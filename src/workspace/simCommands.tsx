import type { Command } from '../components/CommandPalette';
import { RunIcon, StopIcon } from '../design-system';
import type { CommandInputs } from './sceneCommands';

export function simCommands({ core }: CommandInputs): Command[] {
  const { simTraining, posing, tool } = core;
  const { sim } = simTraining;

  if (!posing.hasRig) return [];

  if (sim.status === 'off')
    return [
      {
        id: 'sim-start',
        group: 'Simulate',
        label: 'Simulate',
        icon: <RunIcon />,
        keywords: 'mujoco physics start play sim',
        run: () => {
          tool.openRightTab('sim');
          void sim.start();
        },
      },
    ];

  return [
    {
      id: 'sim-stop',
      group: 'Simulate',
      label: 'Stop Simulation',
      icon: <StopIcon />,
      keywords: 'mujoco physics end sim',
      run: sim.stop,
    },
  ];
}
