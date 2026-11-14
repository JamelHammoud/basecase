import React from 'react';
import { Button, FloatingIsland, IslandDivider, PackageIcon } from '../../design-system';
import type { Plate } from '../../print/plan';
import type { Printing } from '../../workspace/usePrinting';

const plateNote = (active: boolean) => (active ? 'text-white/90' : 'text-white/50');

const plateCell = (active: boolean) =>
  `h-[36px] px-3 rounded-[12px] text-[13px] tabular-nums cursor-default transition-colors duration-150 ${
    active ? 'bg-figma-blue-fill text-white' : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90'
  }`;

export const PlateBar: React.FC<{ printing: Printing; plates: Plate[] }> = ({ printing, plates }) => {
  const current = printing.mode?.plate;
  const plate = plates.find((p) => p.number === current) ?? plates[0];
  const arrange = () =>
    printing.setPartPrint(
      [...new Set(plates.filter((p) => p.material === plate?.material).flatMap((p) => p.items.map((it) => it.id)))],
      { at: undefined, plate: undefined, turned: undefined },
    );

  return (
    <FloatingIsland className="p-1.5 gap-1 rounded-[20px] animate-pop-up max-w-[calc(100vw-760px)] min-w-0">
      <div className="flex gap-1 overflow-x-auto no-scrollbar min-w-0">
        {plates.map((p) => (
          <button
            key={p.number}
            type="button"
            className={plateCell(p.number === plate?.number)}
            onClick={() => printing.setModePlate(p.number)}
          >
            {p.number} <span className={plateNote(p.number === plate?.number)}>{p.material}</span>
            {p.step !== undefined && (
              <span
                data-step={p.step + 1}
                className={`inline-flex items-center gap-1 ml-2 ${plateNote(p.number === plate?.number)}`}
              >
                <PackageIcon className="w-3.5 h-3.5" />
                {p.step + 1}
              </span>
            )}
          </button>
        ))}
      </div>
      {!printing.fitTest && (
        <>
          <IslandDivider />
          <Button size="sm" variant="ghost" onClick={arrange} disabled={!plate}>
            Auto Arrange
          </Button>
        </>
      )}
    </FloatingIsland>
  );
};
