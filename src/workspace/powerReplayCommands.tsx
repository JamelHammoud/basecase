import { PackageIcon } from '../design-system';
import { setPowerReplayOpen } from '../components/build/powerReplayDialog';
import type { CommandInputs } from './sceneCommands';

export function powerReplayCommands({ core }: CommandInputs) {
  if (!core.parts.length || core.buildAlong?.frozen) return [];

  return [
    {
      id: 'inspect-current',
      group: 'Scene' as const,
      label: 'Inspect Current',
      icon: <PackageIcon />,
      keywords: 'electrical voltage resistance replay motor load current',
      run: () => {
        core.tool.openRightTab('build');
        setPowerReplayOpen(core.scene.sceneId);
      },
    },
  ];
}
