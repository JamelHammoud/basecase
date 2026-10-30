import React from 'react';
import { MetaLine } from '../../design-system';
import type { Plate } from '../../print/plan';
import type { PrinterStatus, SlicedPlate } from '../../print/printBridge';
import type { PlateStatus } from '../../print/tracker';
import { hm } from './format';

interface PlateRowProps {
  plate: Plate;
  sliced?: SlicedPlate;
  status: PlateStatus;
  live?: PrinterStatus | null;
  selected?: boolean;
  onClick: () => void;
}

const STATE_TEXT: Record<PlateStatus['state'], string> = {
  new: '',
  sent: 'Sent',
  printing: 'Printing',
  printed: 'Printed',
  failed: 'Failed',
};

function stateText(status: PlateStatus, live?: PrinterStatus | null) {
  if (status.state === 'printing' && live?.progress !== undefined) return `Printing ${Math.round(live.progress * 100)}%`;

  return STATE_TEXT[status.state];
}

const STATE_CLASS: Record<PlateStatus['state'], string> = {
  new: 'text-white/40',
  sent: 'text-white/60',
  printing: 'text-[#5cb8ff]',
  printed: 'text-white/60',
  failed: 'text-red-400',
};

export function plateNumbers(plate: Plate, sliced?: SlicedPlate) {
  if (sliced) return { hours: sliced.seconds / 3600, grams: sliced.grams, exact: true };

  return { hours: plate.hours, grams: plate.grams, exact: false };
}

export const PlateRow: React.FC<PlateRowProps> = ({ plate, sliced, status, live, selected, onClick }) => {
  const { hours, grams, exact } = plateNumbers(plate, sliced);
  const count = plate.items.length;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full flex items-center gap-2.5 py-1.5 px-[7px] rounded-lg text-left cursor-default ${
          selected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
        }`}
      >
        <div className="preview-sm w-10 h-10 shrink-0 flex items-center justify-center overflow-hidden">
          {sliced?.thumbnail ? (
            <img src={sliced.thumbnail} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[12px] text-white/50 tabular-nums">{plate.number}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-white/90 truncate">
            Plate {plate.number} <span className="text-white/45">{plate.material}</span>
          </div>
          <MetaLine
            className="text-[12px] text-white/40 tabular-nums"
            items={[`${count} ${count === 1 ? 'part' : 'parts'}`, `${exact ? '' : '≈ '}${hm(hours)}`, `${Math.round(grams)} g`]}
          />
          {sliced?.warnings.length ? (
            <div className="text-[12px] text-amber-400 truncate">{sliced.warnings[0]}</div>
          ) : null}
        </div>
        <span className={`text-[12px] shrink-0 tabular-nums ${STATE_CLASS[status.state]}`}>
          {stateText(status, live)}
        </span>
      </button>
    </li>
  );
};
