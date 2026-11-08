import React from 'react';
import type { SlashCommand } from '../../agent/slashCommands';
import { MenuItem } from '../../design-system';

export const CommandList: React.FC<{
  commands: readonly SlashCommand[];
  active?: number;
  onPick: (command: SlashCommand) => void;
}> = ({ commands, active, onPick }) =>
  commands.map((command, i) => (
    <MenuItem
      key={command.name}
      label={`/${command.name}`}
      detail={command.hint}
      active={i === active}
      onSelect={() => onPick(command)}
    />
  ));
