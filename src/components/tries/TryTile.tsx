import React from 'react';
import { Badge } from '../../design-system';
import { isGenerated, isReal, passedTry, type TryRecord } from '../../cases/tries';
import { runClock } from '../../utils/duration';
import { tryOutcome } from '../simulate/format';
import { useTryFilm } from './useTryFilm';

interface TryTileProps {
  record: TryRecord;
  selected: boolean;
  onPick: (e: React.MouseEvent) => void;
  onMenu: (e: React.MouseEvent) => void;
}

const outcomeTone = (t: TryRecord) => (passedTry(t) ? 'text-white/85' : 'text-[#f87171]');

export const TryTile: React.FC<TryTileProps> = ({ record, selected, onPick, onMenu }) => {
  const { ref, url } = useTryFilm(record.id);

  return (
    <button
      ref={ref}
      type="button"
      data-testid="try-tile"
      data-try={record.id}
      aria-pressed={selected}
      onClick={onPick}
      onContextMenu={onMenu}
      className={`w-full text-left cursor-default rounded-[10px] p-1.5 [content-visibility:auto] [contain-intrinsic-size:auto_120px] transition-colors duration-150 ${selected ? 'bg-[#0d99ff]/15 ring-2 ring-inset ring-[#0d99ff]' : 'hover:bg-white/[0.05]'}`}
    >
      <div className="h-14 rounded-[6px] bg-white/[0.04] overflow-hidden">
        {url && <img src={url} alt="" className="w-full h-full object-cover" draggable={false} />}
      </div>
      <div className="pt-1.5 px-0.5 flex flex-col gap-0.5">
        <div className="text-[13px] font-medium text-white/90 truncate">{record.case?.name ?? record.robot.name}</div>
        <div className="flex items-center gap-2 text-[12px] tabular">
          <span className={outcomeTone(record)}>{tryOutcome(record)}</span>
          <span className="text-white/50">{runClock(record.seconds)}</span>
          {isGenerated(record) && <Badge>Variation</Badge>}
          {isReal(record) && <Badge>Real</Badge>}
        </div>
      </div>
    </button>
  );
};
