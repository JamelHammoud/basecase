import type { PrintedDemand } from '../../src/kit/allocationTypes';
import type { Purchases } from '../../src/types/robotics';
import type { PrintRecord } from '../../src/types/print';

export function availablePrintCopies(
  purchases: Purchases,
  demand?: PrintedDemand,
): Array<{
  key: string;
  copy: NonNullable<PrintRecord['copies']>[number];
  record: PrintRecord;
}>;

export function retainedPrintRecord(purchases: Purchases, incoming: PrintRecord): PrintRecord;
