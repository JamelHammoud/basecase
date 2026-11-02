import React, { useState } from 'react';
import { ContextMenu, ContextMenuEntry, Tooltip, ArrowUpIcon, StopSolidIcon, TickIcon } from '../../design-system';
import { SendIntent } from './types';

const ROUND_BUTTON =
  'w-8 h-8 rounded-full bg-white text-black flex items-center justify-center cursor-default transition-[transform,background-color] duration-150 active:scale-[0.92] hover:bg-white/90';

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
      <Tooltip label="Stop" shortcut="Esc" side="top">
        <button type="button" aria-label="Stop" onClick={onStop} className={ROUND_BUTTON}>
          <StopSolidIcon className="w-3.5 h-3.5" />
        </button>
      </Tooltip>
    );

  return (
    <>
      <Tooltip label={updating ? 'Update' : 'Send'} shortcut="↩︎" side="top">
        <button
          type="button"
          aria-label={updating ? 'Update' : 'Send'}
          aria-haspopup="menu"
          aria-expanded={!!menu}
          onClick={() => onSend('default')}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
          disabled={!canSend}
          className={`${ROUND_BUTTON} disabled:bg-white/15 disabled:text-white/40 disabled:active:scale-100`}
        >
          {updating ? (
            <TickIcon className="w-[18px] h-[18px]" strokeWidth={2.5} />
          ) : (
            <ArrowUpIcon className="w-[18px] h-[18px]" strokeWidth={2.25} />
          )}
        </button>
      </Tooltip>
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
