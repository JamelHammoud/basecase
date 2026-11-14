import React from 'react';
import { Button } from '../../design-system';
import type { FleetPrinter } from '../../print/fleet';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import type { Printing } from '../../workspace/usePrinting';
import type { PrinterSetup } from '../../data/printers';
import type { Plate } from '../../print/plan';
import { PRINTER_STATE_TEXT } from './plateFacts';

export interface PlateSend {
  plate: Plate;
  printer: PrinterSetup;
}

interface PrinterFleetProps {
  printing: Printing;
  onStartNext: (send: PlateSend) => void;
}

const FleetRow: React.FC<PrinterFleetProps & { printer: FleetPrinter }> = ({ printing, printer, onStartNext }) => {
  const next = printing.nextFor(printer);
  const busy = printing.sending !== null || printing.job.slicing;

  return (
    <div className="flex items-center justify-between gap-3 min-h-[32px]" data-printer={printer.setup.id}>
      <span className="min-w-0 truncate text-[13px] text-white/90">
        {printer.setup.label}
        {printer.status && <span className="text-white/50"> {PRINTER_STATE_TEXT[printer.status.state]}</span>}
      </span>
      {next && (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => onStartNext({ plate: next, printer: printer.setup })}
        >
          Start Next
        </Button>
      )}
    </div>
  );
};

export const showsFleet = (printing: Printing) => !IS_WEB_DEMO && printing.fleet.length > 1;

export const PrinterFleet: React.FC<PrinterFleetProps> = ({ printing, onStartNext }) => {
  if (!showsFleet(printing)) return null;

  return (
    <div className="flex flex-col gap-1">
      {printing.fleet.map((printer) => (
        <FleetRow key={printer.setup.id} printing={printing} printer={printer} onStartNext={onStartNext} />
      ))}
    </div>
  );
};
