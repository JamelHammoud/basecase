import React from 'react';
import { MenuItem, PopoverMenu } from '../../design-system';
import type { SlashMenuState } from './useSlashMenu';

export const SlashMenu: React.FC<{ slash: SlashMenuState; promptRef: React.RefObject<HTMLElement | null> }> = ({
  slash,
  promptRef,
}) => (
  <PopoverMenu
    isOpen={slash.open}
    onClose={slash.close}
    position="top"
    align="start"
    className="w-80"
    ignoreRef={promptRef}
  >
    <div aria-label="Commands" data-testid="slash-menu">
      {slash.items.map((command, i) => (
        <MenuItem
          key={command.name}
          label={`/${command.name}`}
          detail={command.hint}
          active={i === slash.active}
          onSelect={() => slash.pick(command)}
        />
      ))}
    </div>
  </PopoverMenu>
);
