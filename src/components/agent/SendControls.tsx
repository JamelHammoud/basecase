import React, { useState } from 'react';
import { ContextMenu, ContextMenuEntry, IconButton, ArrowUpIcon, StopSolidIcon, TickIcon } from '../../design-system';
import { hasPrimaryModifier } from '../../utils/os';
import { SendIntent } from './types';

interface SendMenuOptions {
  isBusy: boolean;
  canSend: boolean;
  editing: boolean;
  onSend: (intent: SendIntent) => void;
}

const sendMenu = ({ isBusy, canSend, editing, onSend }: SendMenuOptions): ContextMenuEntry[] => [
  {
    label: 'Send Now',
    shortcut: editing && isBusy ? undefined : '↩︎',
    disabled: !canSend,
    onSelect: () => onSend('now'),
  },
  {
    label: 'Queue',
    shortcut: editing ? '↩︎' : '⌘↩︎',
    disabled: !canSend || !isBusy,
    onSelect: () => onSend('queue'),
  },
];

export const SendControls: React.FC<{
  isBusy: boolean;
  hasDraft: boolean;
  canSend: boolean;
  editing: boolean;
  onStop: () => void;
  onSend: (intent: SendIntent) => void;
}> = ({ isBusy, hasDraft, canSend, editing, onStop, onSend }) => {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const updating = editing && isBusy;

  if (isBusy && !hasDraft && !editing)
    return (
      <IconButton
        icon={<StopSolidIcon className="w-3.5 h-3.5" />}
        title="Stop"
        shortcut="Esc"
        tooltipSide="top"
        variant="send"
        className="rounded-full"
        onClick={onStop}
      />
    );

  return (
    <>
      <IconButton
        icon={
          updating ? (
            <TickIcon className="w-[18px] h-[18px]" strokeWidth={2.5} />
          ) : (
            <ArrowUpIcon className="w-[18px] h-[18px]" strokeWidth={2.25} />
          )
        }
        title={updating ? 'Update' : 'Send'}
        shortcut="↩︎"
        tooltipSide="top"
        variant="send"
        className="rounded-full"
        aria-haspopup="menu"
        aria-expanded={!!menu}
        onClick={(e) => onSend(hasPrimaryModifier(e) ? 'queue' : 'default')}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        disabled={!canSend}
      />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={sendMenu({ isBusy, canSend, editing, onSend })}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
};
