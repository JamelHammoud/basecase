import React from 'react';
import { Tooltip, ArrowUpIcon, StopSolidIcon } from '../../design-system';

const ROUND_BUTTON =
  'w-8 h-8 rounded-full bg-white text-black flex items-center justify-center cursor-default transition-[transform,background-color] duration-150 active:scale-[0.92] hover:bg-white/90';

export const SendControls: React.FC<{
  isBusy: boolean;
  hasDraft: boolean;
  canSend: boolean;
  onStop: () => void;
  onSend: () => void;
}> = ({ isBusy, hasDraft, canSend, onStop, onSend }) => {
  if (isBusy && !hasDraft)
    return (
      <Tooltip label="Stop" shortcut="Esc" side="top">
        <button type="button" aria-label="Stop" onClick={onStop} className={ROUND_BUTTON}>
          <StopSolidIcon className="w-3.5 h-3.5" />
        </button>
      </Tooltip>
    );

  return (
    <Tooltip label="Send" shortcut="↩︎" side="top">
      <button
        type="button"
        aria-label="Send"
        onClick={onSend}
        disabled={!canSend}
        className={`${ROUND_BUTTON} disabled:bg-white/15 disabled:text-white/40 disabled:active:scale-100`}
      >
        <ArrowUpIcon className="w-[18px] h-[18px]" strokeWidth={2.25} />
      </button>
    </Tooltip>
  );
};
