import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { listPurchases, savePurchase } from './purchases.mjs';
import { parseBomCsv } from '../../e2e/bomCsv';
import { initialPurchaseForm, purchaseRecord } from '../../src/components/build/purchaseForm';
import { buildBom, bomToCsv } from '../../src/utils/bom';
import { withOnHand, withPrice } from '../../src/utils/onHand';

const setPurchases = vi.hoisted(() => vi.fn());

vi.mock('react', () => ({ useEffect: vi.fn(), useState: (value) => [value, setPurchases] }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const key = 'component:raspberry-pi-pico-2';
const project = { printer: 'default', material: 'PLA', infillPct: 15, extras: [{ key, qty: 3 }] };
const bom = (purchases) => buildBom({ parts: [], project, purchases, measures: {} });
const row = (purchases) =>
  parseBomCsv(bomToCsv(bom(purchases), {})).find((entry) => entry['Customer Reference'] === key);

async function coldPurchases(dir) {
  vi.resetModules();

  const { platformBridge } = await import('../../src/utils/platformBridge');
  const store = await import('../../src/components/build/usePurchases');
  const read = vi.spyOn(platformBridge, 'listPurchases').mockImplementation(async () => listPurchases(dir));

  vi.spyOn(platformBridge, 'savePurchase').mockImplementation(async (purchaseKey, record) =>
    savePurchase(dir, { key: purchaseKey, record }),
  );
  expect(store.knownPurchases()).toBeNull();
  store.usePurchases();

  const cleanup = vi.mocked(useEffect).mock.calls.at(-1)[0]();

  await read.mock.results[0].value;
  expect(setPurchases).toHaveBeenLastCalledWith(listPurchases(dir));

  if (typeof cleanup === 'function') cleanup();

  return store;
}

it('hydrates saved stock and corrected packaging through the renderer store into CSV', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'purchasing-reload-'));
  const record = {
    priceUsd: 6.12,
    packQty: 1,
    checkedAt: '2026-11-18',
    identity: {
      manufacturer: 'Raspberry Pi',
      mpn: 'SC1631',
      supplier: 'DigiKey',
      supplierPartNumber: '2648-SC1631CT-ND',
      orderingUnit: 'piece',
      unitsPerOrder: 1,
    },
  };

  try {
    savePurchase(dir, { key, record: withOnHand(record, 1) });

    const first = await coldPurchases(dir);
    const purchases = first.usePurchases()[0];
    const original = row(purchases);

    expect(original).toMatchObject({
      'Qty Needed': '3',
      'On Hand': '1',
      'Remaining Units': '2',
      'Supplier Part Number': '2648-SC1631CT-ND',
      'Supplier Order Qty': '2',
    });

    const form = initialPurchaseForm(bom(purchases).lines.find((line) => line.key === key));
    const correction = purchaseRecord({
      ...form,
      identity: {
        ...form.identity,
        supplierPartNumber: '2648-SC1631TR-ND',
        orderingUnit: 'reel',
        unitsPerOrder: '2400',
      },
    });

    await first.storePurchase(key, withPrice(purchases[key], correction));

    const reloaded = await coldPurchases(dir);
    const exported = row(reloaded.usePurchases()[0]);

    expect(exported).toEqual(row(first.knownPurchases()));
    expect(exported).toMatchObject({
      'Qty Needed': '3',
      'On Hand': '1',
      'Remaining Units': '2',
      Manufacturer: 'Raspberry Pi',
      'Manufacturer Part Number': 'SC1631',
      Supplier: 'DigiKey',
      'Supplier Part Number': '2648-SC1631TR-ND',
      'Ordering Unit': 'reel',
      'Units per Order': '2400',
      'Supplier Order Qty': '1',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
