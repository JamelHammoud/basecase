import type { Plate } from '../../print/plan';
import type { PrinterStatus, SlicedPlate } from '../../print/printBridge';
import type { PlateStatus } from '../../print/tracker';

const STATE_TEXT: Record<PlateStatus['state'], string> = {
  new: '',
  sent: 'Sent',
  printing: 'Printing',
  printed: 'Printed',
  failed: 'Failed',
};

export function plateStateText(status: PlateStatus, live?: PrinterStatus | null) {
  if (status.state === 'printing' && live?.progress !== undefined)
    return `Printing ${Math.round(live.progress * 100)}%`;

  return STATE_TEXT[status.state];
}

export function plateNumbers(plate: Plate, sliced?: SlicedPlate) {
  if (sliced) return { hours: sliced.seconds / 3600, grams: sliced.grams, exact: true };

  return { hours: plate.hours, grams: plate.grams, exact: false };
}
