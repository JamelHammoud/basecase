import { allocatePurchases } from '../../electron/backend/buildAllocations.mjs';
import { describe, expect, it } from 'vitest';
import { servoArm } from '../sim/fixtures/servoArm';
import { fixtureMeasures } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT, type Purchases } from '../types/robotics';
import { buildBom } from '../utils/bom';
import { confirmOffer } from '../utils/supplierOffers';
import type { SupplierOffer } from '../types/purchasing';
import { sourcingSnapshot, studyPurchasing, sourcingUnchanged } from './sourcing';

const now = '2026-11-20T12:00:00.000Z';
const requirements = { destination: 'US-CA', requiredBy: '2026-12-01', quantity: 20 };
const arm = servoArm();
const input = {
  parts: arm.parts,
  project: { ...DEFAULT_PROJECT, joints: arm.joints },
  measures: fixtureMeasures(arm.parts),
  purchases: {},
};
const bom = buildBom(input);
const line = bom.lines.find((line) => line.key.endsWith('|c001'))!;
const offer: SupplierOffer = {
  id: 'shoulder',
  identity: { ...line.identity, supplier: 'Fixture', supplierPartNumber: '001', orderingUnit: 'pack' },
  breaks: [
    { minOrders: 1, price: 12 },
    { minOrders: 4, price: 10 },
  ],
  availableOrders: 100,
  currency: 'USD',
  destination: 'US-CA',
  observedAt: now,
  arrivalEarliest: '2026-11-23',
  arrivalLatest: '2026-11-25',
  source: 'https://example.com/shoulder',
  evidence: 'entered',
};

function evidence(patch: Partial<SupplierOffer> = {}, per = 4): Purchases {
  return {
    [line.key]: {
      onHand: 6,
      supplierOffers: { selectedId: offer.id, offers: [confirmOffer({ ...offer, ...patch }, line, per)] },
    },
  };
}

function result(patch: Partial<SupplierOffer> = {}, per = 4) {
  return studyPurchasing(bom, sourcingSnapshot(requirements, evidence(patch, per), now));
}

describe('Study sourcing evidence', () => {
  it('scales demand before consuming owned stock and applies packaging and price breaks once', () => {
    const purchases = evidence();
    const before = structuredClone(purchases);
    const snapshot = sourcingSnapshot(requirements, purchases, now);
    const compared = studyPurchasing(bom, snapshot);
    const shoulder = compared.lines.find((item) => item.line.key === line.key)!;

    expect(shoulder).toMatchObject({ line: { qty: 20, owned: 6, toBuy: 14 }, orderQty: 4, total: 40, issues: [] });
    purchases[line.key].onHand = 999;
    expect(studyPurchasing(bom, snapshot)).toEqual(compared);
    expect(snapshot.purchases).toEqual(before);
    expect(compared.purchasingComplete).toBe(false);
    expect(compared.unresolved).toContain('Assembly duration unresolved');
  });

  it.each([
    [{ arrivalLatest: '2026-12-04' }, 'Arrives after required date'],
    [{ availableOrders: 1 }, 'Partial fulfillment'],
    [{ availableOrders: 0 }, 'Unavailable'],
    [{ expiresAt: '2026-11-19T00:00:00Z' }, 'Expired evidence'],
    [{ observedAt: '2026-11-21T00:00:00Z' }, 'Unknown observation date'],
    [{ observedAt: '2026-01-01T00:00:00Z' }, 'Stale evidence'],
    [{ arrivalLatest: undefined }, 'Unknown arrival'],
    [{ destination: 'CA-BC' }, 'Destination mismatch'],
    [{ breaks: [] }, 'Quantity break unavailable'],
    [{ identity: { ...offer.identity, mpn: 'another-variant' } }, 'Unresolved identity'],
  ] as Array<[Partial<SupplierOffer>, string]>)('retains the purchasing reason for %j', (patch, reason) => {
    expect(result(patch).lines.find((item) => item.line.key === line.key)?.issues).toContain(reason);
  });

  it('keeps unknown packaging unresolved and never borrows a changed variant’s confirmation', () => {
    expect(
      result({ identity: { ...offer.identity, orderingUnit: undefined } }).lines.find(
        (item) => item.line.key === line.key,
      )?.issues,
    ).toContain('Unknown packaging');

    const snapshot = sourcingSnapshot(requirements, evidence(), now);
    const changed = { ...bom, lines: [{ ...line, key: 'component:feetech-sts3215|c044' }] };

    expect(studyPurchasing(changed, snapshot).lines[0].issues).toEqual(['Select an offer']);
  });

  it('refuses changed purchases and newly expired evidence without changing historical results', () => {
    const purchases = evidence({ expiresAt: '2026-11-21T00:00:00Z' });
    const snapshot = sourcingSnapshot(requirements, purchases, now);
    const compared = studyPurchasing(bom, snapshot);
    const historical = structuredClone(compared);

    expect(sourcingUnchanged({ snapshot, result: compared, purchases, now })).toBe(true);
    expect(sourcingUnchanged({ snapshot, result: compared, purchases, now: '2026-11-22T00:00:00Z' })).toBe(false);
    expect(
      sourcingUnchanged({ snapshot, result: compared, purchases: { ...purchases, [line.key]: { onHand: 0 } }, now }),
    ).toBe(false);
    expect(compared).toEqual(historical);
  });
});

it('conserves owned units across alternatives and excludes another build’s physical allocations', () => {
  const purchases = evidence();
  const allocated = allocatePurchases(
    purchases,
    {
      kind: 'reserve',
      request: 'fixture-reservation',
      build: { id: 'other-build', name: 'Other robot', kit: 'a'.repeat(64) },
      demand: { key: line.key, name: line.name, qty: 4, partIds: line.partIds },
      quantity: 4,
    },
    now,
  );
  const before = structuredClone(allocated);
  const snapshot = sourcingSnapshot(requirements, allocated, now);
  const first = studyPurchasing(bom, snapshot);
  const second = studyPurchasing(bom, snapshot);
  const shoulder = first.lines.find((item) => item.line.key === line.key)!;

  expect(shoulder.line).toMatchObject({ qty: 20, owned: 2, toBuy: 18 });
  expect(second).toEqual(first);
  expect(allocated).toEqual(before);
  expect(snapshot.purchases[line.key].reservations).toBeUndefined();
  expect(snapshot.purchases[line.key].onHand).toBe(2);
});

it('keeps quantity one owned-stock demand complete without borrowing a quote', () => {
  const single = { ...bom, lines: [line] };
  const snapshot = sourcingSnapshot({ ...requirements, quantity: 1 }, { [line.key]: { onHand: 1 } }, now);

  expect(studyPurchasing(single, snapshot)).toMatchObject({
    purchasingComplete: true,
    totals: {},
    lines: [{ line: { qty: 1, owned: 1, toBuy: 0 }, total: 0, issues: [] }],
  });
});

it('retains a full offer book once without copying unselected evidence into every candidate row', () => {
  const purchases = evidence();
  const selected = purchases[line.key].supplierOffers!.offers[0];
  const offers = Array.from({ length: 500 }, (_, index) => ({
    ...selected,
    offer: { ...selected.offer, id: `quote-${index}` },
  }));

  purchases[line.key] = {
    ...purchases[line.key],
    priceUsd: 12,
    packQty: 4,
    checkedAt: '2026-11-20',
    supplierOffers: { selectedId: 'quote-0', offers },
  };

  const snapshot = sourcingSnapshot(requirements, purchases, now);
  const actual = buildBom({ ...input, purchases, now: new Date(now) });
  const compared = studyPurchasing(actual, snapshot);

  expect(snapshot.purchases[line.key].supplierOffers?.offers).toHaveLength(500);
  expect(JSON.stringify(compared)).not.toContain('quote-499');
  expect(compared.lines.find((item) => item.line.key === line.key)?.selected?.offer.id).toBe('quote-0');
  expect(purchases[line.key].supplierOffers?.offers).toHaveLength(500);
});
