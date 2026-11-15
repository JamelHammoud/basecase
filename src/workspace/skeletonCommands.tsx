import type { Command } from '../components/CommandPalette';
import { PoseIcon } from '../design-system';
import type { CommandInputs } from './sceneCommands';

export function skeletonCommands({ core, actions }: CommandInputs): Command[] {
  return [
    {
      id: 'design-from-motion',
      group: 'Pose',
      label: 'Design From Motion',
      icon: <PoseIcon />,
      keywords: 'bvh mocap motion capture skeleton bones joints servo height',
      run: actions.pose.designFromMotion,
    },
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
