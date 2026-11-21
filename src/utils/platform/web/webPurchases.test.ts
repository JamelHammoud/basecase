import { beforeEach, expect, it, vi } from 'vitest';
import type { Purchases, StoredPurchase } from '../../../types/robotics';
import { webRequest } from './webBackend';
import { idbGet, idbSettingsUpdate } from './idb';
import { listPurchases, savePurchase } from './webPurchases';

vi.mock('./idb', () => ({
  idbGet: vi.fn(),
  idbSettingsUpdate: vi.fn(),
  idbAll: vi.fn(),
  idbDelete: vi.fn(),
  idbPut: vi.fn(),
}));

let disk: Purchases;
const key = 'component:raspberry-pi-pico-2';
const record: StoredPurchase = {
  onHand: 1,
  supplierOffers: {
    offers: [
      {
        offer: {
          id: '00001',
          identity: {
            manufacturer: 'Raspberry Pi',
            mpn: 'SC1631',
            supplier: 'Shop',
            supplierPartNumber: '00012',
            orderingUnit: 'reel',
            unitsPerOrder: 100,
          },
          breaks: [{ minOrders: 1, price: 120 }],
          availableOrders: 5,
          currency: 'EUR',
          destination: 'DE',
          source: 'quote.csv:2',
          evidence: 'imported',
          observedAt: '2026-11-20T00:00:00Z',
        },
        matchedIdentity: 'confirmed',
        unitsPerOrder: 100,
      },
    ],
    selectedId: '00001',
  },
};

beforeEach(() => {
  disk = {};
  vi.mocked(idbGet).mockImplementation(async () => structuredClone(disk));

  let queue = Promise.resolve();

  vi.mocked(idbSettingsUpdate).mockImplementation((keys, change) => {
    const saved = queue.then(() => {
      const changed = change(keys.map(() => structuredClone(disk)));

      disk = structuredClone(changed.puts.purchases as Purchases);

      return changed.result;
    });

    queue = saved.then(
      () => undefined,
      () => undefined,
    );

    return saved;
  });
});

it('stores evidence through the browser route and hydrates the same saved selection', async () => {
  const response = await webRequest('/purchase-save', { method: 'POST', body: JSON.stringify({ key, record }) });

  expect(response.status).toBe(200);
  expect((await listPurchases())[key]).toEqual(record);
  expect(idbSettingsUpdate).toHaveBeenLastCalledWith(['purchases'], expect.any(Function));
});

it('retains the committed record after an aborted IndexedDB write and admits a subsequent save', async () => {
  await savePurchase({ key, record });
  vi.mocked(idbSettingsUpdate).mockRejectedValueOnce(new Error('transaction aborted'));
  await expect(savePurchase({ key, record: { onHand: 9 } })).rejects.toThrow('transaction aborted');
  expect((await listPurchases())[key]).toEqual(record);
  await savePurchase({ key: 'plan:arm', record: { purchasePlan: { destination: 'DE', requiredBy: '2026-12-01' } } });
  expect((await listPurchases())[key]).toEqual(record);
});

it('serializes simultaneous edits to different records without dropping quote evidence', async () => {
  await Promise.all([savePurchase({ key, record }), savePurchase({ key: 'other', record: { onHand: 2 } })]);
  expect(await listPurchases()).toMatchObject({ [key]: record, other: { onHand: 2 } });
});
