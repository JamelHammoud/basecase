import type { Command } from '../components/CommandPalette';
import { RunIcon, StopIcon, CasesIcon } from '../design-system';
import type { CommandInputs } from './sceneCommands';

export function simCommands({ core }: CommandInputs): Command[] {
  const { simTraining, posing, tool } = core;
  const { sim } = simTraining;

  if (!posing.hasRig) return [];

  const makeWorld = core.dataLayers.rows().find((layer) => layer.makeWorld)?.makeWorld;
  const mapCommands: Command[] = makeWorld
    ? [
        {
          id: 'map-make-world',
          group: 'Simulate',
          label: 'Make World',
          icon: <CasesIcon />,
          keywords: 'map scan recording reconstruct collider',
          run: makeWorld,
        },
      ]
    : [];

  if (sim.status === 'off')
    return [
      ...mapCommands,
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
    ...mapCommands,
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
