import { expect, it } from 'vitest';
import { parseBomCsv } from '../../e2e/bomCsv';
import { buildBom } from './bom';
import { box, fixtureMeasures } from '../sim/fixtures/parts';
import { importOffers, OFFER_COLUMNS } from './supplierOfferCsv';
import { comparePurchasing, confirmOffer, purchasingCsv } from './supplierOffers';
import type { SupplierOffer } from '../types/purchasing';
import type { Purchases } from '../types/robotics';

const now = '2026-11-20T12:00:00Z';
const identity = {
  manufacturer: '製造,"Maker"',
  mpn: '00042',
  supplier: 'Supplier',
  supplierPartNumber: '000009',
  orderingUnit: 'pack',
  unitsPerOrder: 4,
};
const plan = { destination: 'US-CA', requiredBy: '2026-12-01' };
const project = { printer: 'default', material: 'PLA' as const, infillPct: 15 };
const key = 'component:raspberry-pi-pico-2';

export const quote = (patch: Partial<SupplierOffer> = {}): SupplierOffer => ({
  id: 'quote-1',
  identity,
  breaks: [
    { minOrders: 1, price: 12 },
    { minOrders: 3, price: 10 },
  ],
  availableOrders: 100,
  currency: 'USD',
  destination: 'US-CA',
  observedAt: now,
  arrivalEarliest: '2026-11-23',
  arrivalLatest: '2026-11-25',
  source: 'https://example.com/quote/0001',
  evidence: 'imported',
  ...patch,
});

function comparison(patch: Partial<SupplierOffer>, destination = 'US-CA') {
  const purchases: Purchases = { [key]: { identity, priceUsd: 1, packQty: 1, checkedAt: '2026-11-20' } };
  const bom = buildBom({ parts: [], project: { ...project, extras: [{ key, qty: 9 }] }, purchases, measures: {} });
  const offer = quote(patch);

  purchases[key].supplierOffers = { offers: [confirmOffer(offer, bom.lines[0], 4)], selectedId: offer.id };

  return comparePurchasing({ bom, purchases, plan: { ...plan, destination }, now });
}

it.each([
  [{ availableOrders: 1 }, 'Partial fulfillment'],
  [{ availableOrders: 0 }, 'Unavailable'],
  [{ availableOrders: undefined }, 'Unknown availability'],
  [{ expiresAt: '2026-11-19T00:00:00Z' }, 'Expired evidence'],
  [{ observedAt: '2026-01-01T00:00:00Z' }, 'Stale evidence'],
  [{ arrivalLatest: undefined }, 'Unknown arrival'],
  [{ arrivalLatest: '2026-12-04' }, 'Arrives after required date'],
  [{ identity: { ...identity, mpn: 'conflict' } }, 'Unresolved identity'],
] as const)('preserves unresolved purchasing inputs %s', (patch, status) => {
  const result = comparison(patch);

  expect(result.lines[0].issues).toContain(status);
  expect(result.estimatedArrival).toBeUndefined();
});

it('recomputes destination and preserves mixed currencies without conversion', () => {
  expect(comparison({}, 'CA-BC').lines[0].issues).toContain('Destination mismatch');
  expect(comparison({ currency: 'EUR' }).totals).toEqual({ EUR: 30 });
});

it('rechecks identity edits and packaging corrections without rewriting quote evidence', () => {
  const offer = quote();
  const purchases: Purchases = { [key]: { identity, priceUsd: 1, packQty: 1, checkedAt: '2026-11-20' } };
  const bom = buildBom({ parts: [], project: { ...project, extras: [{ key, qty: 9 }] }, purchases, measures: {} });
  const confirmed = confirmOffer(offer, bom.lines[0], 6);

  purchases[key].supplierOffers = { offers: [confirmed], selectedId: offer.id };
  expect(comparePurchasing({ bom, purchases, plan, now }).lines[0].orderQty).toBe(2);
  expect(confirmed.offer.identity.unitsPerOrder).toBe(4);
  bom.lines[0].identity = { ...identity, sourceUrl: 'https://example.com/changed' };
  expect(comparePurchasing({ bom, purchases, plan, now }).lines[0].issues).toContain('Confirm match and packaging');
});

it('validates bounded CSV transactionally and keeps identifiers as strings', () => {
  const text = `${OFFER_COLUMNS.join(',')}\nMaker,00042,Supplier,000009,pack,4,1:12|3:10,100,USD,US-CA,${now},,2026-11-23,2026-11-25,https://example.com\n`;
  const [offer] = importOffers(text, 'quotes.csv');

  expect(offer.identity.mpn).toBe('00042');
  expect(offer.identity.supplierPartNumber).toBe('000009');
  expect(offer.evidence).toBe('imported');
  expect(() => importOffers(text + 'broken\n', 'quotes.csv')).toThrow();
  expect(() => importOffers('x'.repeat(1_048_577), 'quotes.csv')).toThrow();
  expect(() => importOffers(text + text.split('\n')[1].concat('\n').repeat(500), 'quotes.csv')).toThrow();
  expect(() => importOffers(text.replace('1:12|3:10', 'NaN'), 'quotes.csv')).toThrow();
});

it('protects exported formula cells and leaves printing and assembly unresolved', () => {
  const result = comparison({ source: '=HYPERLINK("https://example.com")' });
  const rows = parseBomCsv(purchasingCsv(result));

  expect(rows[0]['Source Reference'].startsWith("'=")).toBe(true);
  expect(rows.some((row) => row.Status === 'Assembly duration unresolved')).toBe(true);
});

it('preserves quoted Unicode identity and formula-like cells without executing them', () => {
  const csv = `${OFFER_COLUMNS.join(',')}\r\n"製造,""Maker""",00042,Supplier,000009,pack,4,1:12,100,USD,US-CA,${now},,2026-11-23,2026-11-25,"=HYPERLINK(""https://example.com"")"\r\n`;
  const [offer] = importOffers(csv, '引合.csv');
  const purchases: Purchases = { [key]: { identity, priceUsd: 1, packQty: 1, checkedAt: '2026-11-20' } };
  const bom = buildBom({ parts: [], project: { ...project, extras: [{ key, qty: 3 }] }, purchases, measures: {} });

  purchases[key].supplierOffers = { offers: [confirmOffer(offer, bom.lines[0], 4)], selectedId: offer.id };

  const result = comparePurchasing({ bom, purchases, plan, now });
  const row = parseBomCsv(purchasingCsv(result))[0];

  expect(result.purchasingComplete).toBe(true);
  expect(row).toMatchObject({
    Manufacturer: '製造,"Maker"',
    'Manufacturer Part Number': '00042',
    'Supplier Part Number': '000009',
    'Source Reference': '\'=HYPERLINK("https://example.com")',
    'Import Reference': '引合.csv:2',
  });
  expect(() => importOffers(csv.replace('1:12', '1:12:13'), 'quote.csv')).toThrow();
});

it('keeps printing and assembly unresolved even when owned stock covers every purchase', () => {
  const parts = [box('printed-arm-bracket', [0, 0, 0], [10, 10, 10], 1)];
  const purchases: Purchases = { 'supply:filament-pla': { onHand: 100000 } };
  const bom = buildBom({ parts, project, purchases, measures: fixtureMeasures(parts) });
  const before = JSON.stringify({ parts, project, purchases });
  const result = comparePurchasing({ bom, purchases, plan, now });

  expect(result.purchasingComplete).toBe(true);
  expect(result.estimatedArrival).toBeUndefined();
  expect(result.unresolved).toEqual(['Assembly duration unresolved', 'Printed parts unresolved']);
  expect(parseBomCsv(purchasingCsv(result)).map((row) => row.Status)).toContain('Printed parts unresolved');
  expect(JSON.stringify({ parts, project, purchases })).toBe(before);
});
