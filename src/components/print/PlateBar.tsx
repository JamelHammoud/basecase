import React from 'react';
import { Button, CloseIcon, FloatingIsland, IconButton, IslandDivider } from '../../design-system';
import type { Plate } from '../../print/plan';
import type { Printing } from '../../workspace/usePrinting';

const plateCell = (active: boolean) =>
  `h-[36px] px-3 rounded-[12px] text-[13px] tabular-nums cursor-default transition-colors duration-150 ${
    active ? 'bg-[#0d99ff] text-white' : 'text-white/70 hover:bg-white/[0.06] hover:text-white/90'
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
            {p.number}{' '}
            <span className={p.number === plate?.number ? 'text-white/80' : 'text-white/40'}>{p.material}</span>
          </button>
        ))}
      </div>
      <IslandDivider />
      <Button size="sm" variant="ghost" onClick={arrange} disabled={!plate}>
        Auto Arrange
      </Button>
      <IslandDivider />
      <IconButton
        icon={<CloseIcon className="w-5 h-5" />}
        title="Close plates"
        shortcut="Esc"
        tooltipSide="top"
        size="lg"
        onClick={printing.closeMode}
      />
    </FloatingIsland>
  );
};
