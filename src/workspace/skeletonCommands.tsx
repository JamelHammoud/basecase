import type { Command } from '../components/CommandPalette';
import { PoseIcon } from '../design-system';
import type { CommandInputs } from './sceneCommands';

export function skeletonCommands({ core }: CommandInputs): Command[] {
  return [
    {
      id: 'edit-skeleton',
      group: 'Pose',
      label: 'Edit Skeleton',
      icon: <PoseIcon />,
      keywords: 'stick figure joints limbs bones arm biped template servo margin',
      run: () => {
        core.skeleton.setEditing(true);
        core.tool.setMode('pose');
      },
    },
  ];
}
