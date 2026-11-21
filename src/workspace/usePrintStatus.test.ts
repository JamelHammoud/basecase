import { expect, it, vi } from 'vitest';
import { allocatePurchases } from '../../electron/backend/buildAllocations.mjs';
import { availablePrintCopies } from '../../electron/backend/printAllocations.mjs';
import * as purchasing from '../components/build/usePurchases';
import type { PrintRecord, Purchases } from '../types/robotics';
import { retainReportedPrint } from './usePrintStatus';

it.each(['enteredAt', 'reportedAt'] as const)(
  'preserves %s completion and canonical scene status when an older printing report arrives',
  async (evidence) => {
    const completed: PrintRecord = {
      id: 'attempt',
      plate: 1,
      hash: 'plate',
      printer: 'Fixture',
      material: 'PLA',
      sentAt: '2026-11-20T10:00:00Z',
      state: 'printed',
      parts: [{ id: 'tab', key: 'shape' }],
      copies: [{ id: 'copy', partId: 'tab', key: 'shape', index: 0 }],
      completion: { [evidence]: '2026-11-20T10:01:00Z' },
    };
    let stock: Purchases = allocatePurchases({}, { kind: 'print', record: completed });
    let records = [completed];
    const saved = vi.spyOn(purchasing, 'allocatePurchase').mockImplementation(async (request) => {
      stock = allocatePurchases(stock, request);

      return stock;
    });

    try {
      await retainReportedPrint({ ...completed, state: 'printing', completion: undefined }, (update) => {
        records = update(records);
      });
      expect(stock['print:attempt'].printOutput!.record).toEqual(completed);
      expect(records).toEqual([completed]);
      expect(availablePrintCopies(stock).map((entry) => entry.copy.id)).toEqual(['copy']);
    } finally {
      saved.mockRestore();
    }
  },
);
