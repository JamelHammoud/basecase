import React from 'react';
import type { SlashCommand } from '../../agent/slashCommands';
import { MenuItem } from '../../design-system';
import { SLASH_ICONS } from './slashIcons';

export const CommandList: React.FC<{
  commands: readonly SlashCommand[];
  active?: number;
  onPick: (command: SlashCommand) => void;
}> = ({ commands, active, onPick }) =>
  commands.map((command, i) => (
    <MenuItem
      key={command.name}
      icon={SLASH_ICONS[command.name]}
      label={`/${command.name}`}
      detail={command.label}
      active={i === active}
      onSelect={() => onPick(command)}
    />
  ));
