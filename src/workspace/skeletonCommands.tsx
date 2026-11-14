import type { Command } from '../components/CommandPalette';
import { JointsIcon, PoseIcon } from '../design-system';
import type { CommandInputs } from './sceneCommands';

export function skeletonCommands({ core, actions }: CommandInputs): Command[] {
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
    {
      id: 'design-from-motion',
      group: 'Pose',
      label: 'Design From Motion',
      icon: <JointsIcon />,
      keywords: 'bvh mocap motion capture clip animation fit skeleton joints dof servos robot from movement',
      run: actions.pose.designFromMotion,
    },
  ];
}
