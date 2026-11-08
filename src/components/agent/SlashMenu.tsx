import React from 'react';
import { PopoverMenu } from '../../design-system';
import { CommandList } from './CommandList';
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
      <CommandList commands={slash.items} active={slash.active} onPick={slash.pick} />
    </div>
  </PopoverMenu>
);
