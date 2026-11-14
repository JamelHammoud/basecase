import type { Command } from '../components/CommandPalette';
import { BotIcon, type ContextMenuEntry } from '../design-system';
import type { CommandInputs } from './sceneCommands';
import type { WorkspaceActions } from './useWorkspaceActions';

const LABEL = 'Make a Leader';

export function leaderCommands({ actions }: CommandInputs): Command[] {
  const { robots } = actions;

  if (!robots.leaderArms.length) return [];

  return [
    {
      id: 'make-leader',
      group: 'Robots',
      label: LABEL,
      icon: <BotIcon />,
      keywords: 'leader follower arm teleop teleoperation demonstrations gello so-101 xl330 dynamixel handle trigger',
      run: () => void robots.makeLeader(),
    },
  ];
}

export function leaderMenuItems(actions: WorkspaceActions, partId: string): ContextMenuEntry[] {
  const robot = actions.robots.armOfPart(partId);

  if (!robot) return [];

  return [{ label: LABEL, icon: <BotIcon />, onSelect: () => void actions.robots.makeLeader(robot) }];
}
