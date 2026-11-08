import React from 'react';
import { SLASH_COMMANDS, type SlashCommand } from '../../agent/slashCommands';
import { MenuBack, MenuDivider } from '../../design-system';
import { CommandList } from './CommandList';

export const CommandsView: React.FC<{ onBack: () => void; onPick: (command: SlashCommand) => void }> = ({
  onBack,
  onPick,
}) => (
  <div aria-label="Commands" data-testid="plus-commands">
    <MenuBack label="Commands" onBack={onBack} />
    <MenuDivider />
    <CommandList commands={SLASH_COMMANDS} onPick={onPick} />
  </div>
);
