import React from 'react';
import { Button, MetaLine, Modal } from '../../design-system';
import type { PrinterSetup } from '../../data/printers';
import type { Plate } from '../../print/plan';
import type { PrinterStatus, SlicedPlate } from '../../print/printBridge';
import { hm } from '../build/format';
import { plateNumbers } from '../build/PlateRow';

interface StartPrintSheetProps {
  plate: Plate | null;
  sliced?: SlicedPlate;
  printer: PrinterSetup;
  live: PrinterStatus | null;
  onStart: () => void;
  onClose: () => void;
}

function trayNote(plate: Plate, live: PrinterStatus | null) {
  const trays = live?.trays ?? [];

  if (!trays.length) return `Load ${plate.material} before starting.`;

  const match = trays.find((t) => t.type.toUpperCase().startsWith(plate.material));

  return match
    ? `Prints with ${plate.material} from slot ${match.slot + 1}.`
    : `Load ${plate.material} in the AMS or change the plate's material. Loaded: ${[...new Set(trays.map((t) => t.type))].join(', ')}.`;
}

export const StartPrintSheet: React.FC<StartPrintSheetProps> = ({ plate, sliced, printer, live, onStart, onClose }) => {
  if (!plate) return null;

  const { hours, grams, exact } = plateNumbers(plate, sliced);
  const busy = live && ['printing', 'preparing', 'paused'].includes(live.state);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Print plate ${plate.number} on ${printer.label}?`}
      maxWidth="max-w-[420px]"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onStart} disabled={!!busy} autoFocus>
            Start Print
          </Button>
        </div>
      }
    >
      <div className="flex gap-4">
        {sliced?.thumbnail && (
          <img src={sliced.thumbnail} alt="" className="preview-sm w-[96px] h-[96px] object-contain shrink-0" />
        )}
        <div className="min-w-0 flex flex-col gap-2 text-[13px] text-white/80">
          <MetaLine
            className="text-[12.5px] text-white/45 tabular-nums"
            items={[plate.material, `${exact ? '' : '≈ '}${hm(hours)}`, `${Math.round(grams)} g`]}
          />
          <p>{trayNote(plate, live)}</p>
          <p>
            {busy ? `${printer.label} is busy. Start this plate when it finishes.` : 'Clear the bed before starting.'}
          </p>
        </div>
      </div>
    </Modal>
  );
};
