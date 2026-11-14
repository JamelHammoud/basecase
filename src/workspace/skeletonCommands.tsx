import type { Command } from '../components/CommandPalette';
import { PoseIcon } from '../design-system';
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
      icon: <PoseIcon className="w-4 h-4" />,
      keywords: 'bvh mocap motion capture clip fit skeleton joints servos degrees of freedom dof',
      run: () => void actions.motionDesign.pick(),
    },
  ];
}
