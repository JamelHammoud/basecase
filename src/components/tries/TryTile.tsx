import React from 'react';
import type { StoredTry, TryResult } from '../../cases/storedTry';
import { Badge, PreviewImage } from '../../design-system';
import { runClock } from '../../utils/duration';
import { useTryFilm } from './useTryFilm';

const OUTCOME: Record<TryResult, { label: string; tone: string } | null> = {
  passed: { label: 'Passed', tone: 'text-white/85' },
  failed: { label: 'Missed', tone: 'text-[#f87171]' },
  unjudged: null,
};

export const TryTile: React.FC<{
  stored: StoredTry;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onMenu: (e: React.MouseEvent) => void;
}> = ({ stored, selected, onClick, onMenu }) => {
  const { ref: filmRef, src: filmSrc } = useTryFilm<HTMLDivElement>(stored.id);
  const outcome = OUTCOME[stored.outcome.result];

  return (
    <button
      type="button"
      role="option"
      data-testid="try-tile"
      data-try-id={stored.id}
      aria-selected={selected}
      onClick={onClick}
      onContextMenu={onMenu}
      className="group min-w-0 text-left cursor-default"
    >
      <div
        ref={filmRef}
        className={`preview preview-sm aspect-[36/7] group-active:scale-[0.98] transition-[background-color,transform] duration-150 ${
          selected ? 'ring-[1.5px] ring-inset ring-[#0d99ff]/70' : ''
        }`}
      >
        <PreviewImage src={filmSrc} className="animate-fade-in" />
      </div>
      <div className="pl-0.5 pt-2 flex items-center gap-2 text-[13px] leading-[19px]">
        {outcome && <span className={outcome.tone}>{outcome.label}</span>}
        {stored.source === 'real' && <Badge>Real</Badge>}
        <span className="text-white/50 tabular">{runClock(stored.seconds)}</span>
      </div>
      <div className="pl-0.5 text-[12px] text-white/50 truncate">{stored.case?.name}</div>
    </button>
  );
};
