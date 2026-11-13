import type { Command } from '../components/CommandPalette';
import { PoseIcon, type ContextMenuEntry } from '../design-system';
import type { CommandInputs } from './sceneCommands';
import type { WorkspaceActions } from './useWorkspaceActions';

export const SIZE_ARM = 'Size Arm to Targets';

export function sizeArmMenuItems(actions: WorkspaceActions): ContextMenuEntry[] {
  if (!actions.arm.targets.length) return [];

  return [{ label: SIZE_ARM, icon: <PoseIcon className="w-3.5 h-3.5" />, onSelect: () => actions.arm.open() }];
}

export function skeletonCommands({ core, actions }: CommandInputs): Command[] {
  const sizeArm: Command[] = actions.arm.targets.length
    ? [
        {
          id: 'size-arm',
          group: 'Pose',
          label: SIZE_ARM,
          icon: <PoseIcon className="w-4 h-4" />,
          keywords: 'arm reach targets payload link lengths servo sizing so-101 manipulator design',
          run: () => actions.arm.open(),
        },
      ]
    : [];

  return [
    ...sizeArm,
    {
      id: 'edit-skeleton',
      group: 'Pose',
      label: 'Edit Skeleton',
      icon: <PoseIcon className="w-4 h-4" />,
      keywords: 'stick figure joints limbs bones arm biped template servo margin',
      run: () => {
        core.skeleton.setEditing(true);
        core.tool.setMode('pose');
      },
    },
  ];
}
