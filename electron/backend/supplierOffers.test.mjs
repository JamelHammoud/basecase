import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { listPurchases, savePurchase } from './purchases.mjs';
import { buildBom } from '../../src/utils/bom';
import { comparePurchasing, confirmOffer, purchasingCsv } from '../../src/utils/supplierOffers';
import { withOnHand, withPrice } from '../../src/utils/onHand';
import { parseBomCsv } from '../../e2e/bomCsv';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supplier-offers-'));
const key = 'component:raspberry-pi-pico-2';
const identity = {
  manufacturer: 'Raspberry Pi',
  mpn: 'SC1631',
  supplier: 'Shop',
  supplierPartNumber: '00001',
  orderingUnit: 'pack',
  unitsPerOrder: 2,
};
const plan = { destination: 'US-CA', requiredBy: '2026-12-01' };
const now = '2026-11-20T12:00:00Z';
const project = { printer: 'default', material: 'PLA', infillPct: 15, extras: [{ key, qty: 9 }] };
const bom = (purchases) => buildBom({ parts: [], project, purchases, measures: {} });
const exportOf = (purchases) =>
  parseBomCsv(purchasingCsv(comparePurchasing({ bom: bom(purchases), purchases, plan, now })))[0];
const offer = {
  id: '0001',
  identity,
  breaks: [{ minOrders: 1, price: 12 }],
  availableOrders: 100,
  currency: 'EUR',
  destination: 'US-CA',
  observedAt: now,
  arrivalEarliest: '2026-11-23',
  arrivalLatest: '2026-11-25',
  source: 'quote.csv:2',
  evidence: 'imported',
};

function initialRecord() {
  const line = bom({}).lines.find((item) => item.key === key);

  return { onHand: 1, supplierOffers: { offers: [confirmOffer(offer, line, 2)], selectedId: '0001' } };
}

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
});

it('retains evidence and selection across disk restart and ordinary stock, price and packaging edits', () => {
  savePurchase(dir, { key, record: initialRecord() });

  const reloaded = listPurchases(dir);

  expect(exportOf(reloaded)).toMatchObject({
    'Remaining Units': '8',
    'Supplier Order Qty': '4',
    'Line Total': '48',
    'Observed At': now,
  });
  savePurchase(dir, { key, record: withOnHand(reloaded[key], 4) });

  const changed = listPurchases(dir);
  const price = {
    identity: { ...identity, supplierPartNumber: 'changed' },
    packQty: 1,
    priceUsd: 1,
    checkedAt: '2026-11-20',
  };

  savePurchase(dir, { key, record: withPrice(changed[key], price) });
  expect(exportOf(listPurchases(dir))).toMatchObject({
    'Remaining Units': '5',
    'Supplier Order Qty': '3',
    'Line Total': '36',
    Status: 'Confirm match and packaging',
  });
  expect(listPurchases(dir)[key].supplierOffers.offers[0].offer).toEqual(offer);
  savePurchase(dir, { key, record: withPrice(listPurchases(dir)[key], null) });
  expect(listPurchases(dir)[key].supplierOffers.selectedId).toBe('0001');
});

it('preserves the last complete purchases file after interrupted publication', () => {
  savePurchase(dir, { key, record: initialRecord() });

  const before = fs.readFileSync(path.join(dir, 'purchases.json'), 'utf8');

  vi.spyOn(fs, 'renameSync').mockImplementation(() => {
    throw new Error('interrupted');
  });
  expect(() => savePurchase(dir, { key, record: withOnHand(initialRecord(), 9) })).toThrow('interrupted');
  expect(fs.readFileSync(path.join(dir, 'purchases.json'), 'utf8')).toBe(before);
  expect(listPurchases(dir)[key].onHand).toBe(1);
});

it.each([
  { ...offer, availableOrders: -1 },
  { ...offer, currency: 'usd' },
  { ...offer, arrivalLatest: '2026-02-30' },
  { ...offer, observedAt: 'not a timestamp' },
  { ...offer, breaks: [{ minOrders: 1, price: Infinity }] },
])('rejects malformed persisted evidence before changing purchases %j', (bad) => {
  savePurchase(dir, { key, record: initialRecord() });

  const before = fs.readFileSync(path.join(dir, 'purchases.json'), 'utf8');

  expect(() =>
    savePurchase(dir, {
      key,
      record: { supplierOffers: { offers: [{ offer: bad, matchedIdentity: '', unitsPerOrder: 1 }] } },
    }),
  ).toThrow();
  expect(fs.readFileSync(path.join(dir, 'purchases.json'), 'utf8')).toBe(before);
});

it('bounds retained Unicode evidence by encoded bytes before touching disk', () => {
  savePurchase(dir, { key, record: initialRecord() });

  const before = fs.readFileSync(path.join(dir, 'purchases.json'), 'utf8');
  const offers = Array.from({ length: 300 }, (_, index) => ({
    ...initialRecord().supplierOffers.offers[0],
    offer: { ...offer, id: String(index), source: '製'.repeat(2000) },
  }));

  expect(() => savePurchase(dir, { key, record: { supplierOffers: { offers } } })).toThrow(
    'Keep saved offers under 1 MiB per item.',
  );
  expect(fs.readFileSync(path.join(dir, 'purchases.json'), 'utf8')).toBe(before);
});
