import React from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Tooltip } from '../../design-system';

export const SendControls: React.FC<{
  isBusy: boolean;
  hasDraft: boolean;
  canSend: boolean;
  onStop: () => void;
  onSend: () => void;
}> = ({ isBusy, hasDraft, canSend, onStop, onSend }) => {
  const sendLabel = isBusy ? 'Send now' : 'Send';

  return (
    <>
      {isBusy && (
        <Tooltip label="Stop" shortcut="Esc" side="top">
          <button
            type="button"
            aria-label="Stop"
            onClick={onStop}
            className={`w-8 h-8 rounded-full flex items-center justify-center cursor-default transition-[transform,background-color] duration-150 active:scale-[0.92] ${
              hasDraft ? 'bg-white/[0.1] text-white/85 hover:bg-white/[0.16]' : 'bg-white text-black hover:bg-white/90'
            }`}
          >
            <Square className="w-3 h-3 fill-current" />
          </button>
        </Tooltip>
      )}
      {(!isBusy || hasDraft) && (
        <Tooltip label={sendLabel} shortcut="↩︎" side="top">
          <button
            type="button"
            aria-label={sendLabel}
            onClick={onSend}
            disabled={!canSend}
            className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center cursor-default transition-[transform,background-color] duration-150 active:scale-[0.92] hover:bg-white/90 disabled:bg-white/15 disabled:text-white/40 disabled:active:scale-100"
          >
            <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </Tooltip>
      )}
    </>
  );
};
