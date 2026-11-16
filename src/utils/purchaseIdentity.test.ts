import { expect, it } from 'vitest';
import { catalogIdentity, lineIdentity, supplierOrderQty } from './purchaseIdentity';
import { registerSourced } from '../data/sourcedItems';

it('uses exact variant metadata and leaves a descriptive family part number blank', () => {
  expect(catalogIdentity('component:feetech-sts3215|c001')).toMatchObject({
    manufacturer: 'Feetech',
    mpn: 'ST-3215-C001',
  });
  expect(catalogIdentity('component:feetech-sts3215')?.mpn).toBeUndefined();
  expect(catalogIdentity('component:raspberry-pi-5')?.mpn).toBeUndefined();
  expect(catalogIdentity('component:raspberry-pi-pico-2')).toMatchObject({
    manufacturer: 'Raspberry Pi',
    mpn: 'SC1631',
  });
});

it('preserves sourced manufacturer, supplier, packaging and provenance without parsing descriptions', () => {
  const supplierIdentity = {
    supplier: 'DigiKey',
    supplierPartNumber: 'EXACT-TR-ND',
    orderingUnit: 'reel',
    unitsPerOrder: 2400,
    sourceUrl: 'https://supplier.example/exact',
  };

  registerSourced([
    {
      id: 'purchasing-fixture',
      kind: 'material',
      name: 'Not a part number',
      maker: 'Maker',
      mpn: 'EXACT',
      spec: 'A description',
      url: 'https://maker.example/exact',
      sources: [],
      addedAt: '2026-11-16',
      link: { status: 'confirmed', checkedAt: '2026-11-16' },
      supplierIdentity,
    },
  ]);
  expect(catalogIdentity('supply:purchasing-fixture')).toEqual({
    manufacturer: 'Maker',
    mpn: 'EXACT',
    ...supplierIdentity,
  });
});

it('treats a purchase correction as a complete identity and keeps legacy manufacturer facts compatible', () => {
  const record = { packQty: 1, priceUsd: 5, checkedAt: '2026-11-16', url: 'https://other.example/SC9999' };

  expect(lineIdentity('component:raspberry-pi-pico-2', record)).toEqual({
    manufacturer: 'Raspberry Pi',
    mpn: 'SC1631',
  });
  expect(lineIdentity('component:raspberry-pi-pico-2', { ...record, identity: {} })).toEqual({});
});

it.each([undefined, 0, -1, NaN, Infinity])(
  'leaves a missing or unusable conversion %s unorderable',
  (unitsPerOrder) => {
    expect(
      supplierOrderQty(8, {
        supplier: 'DigiKey',
        supplierPartNumber: 'EXACT-ND',
        orderingUnit: 'piece',
        unitsPerOrder,
      }),
    ).toBeUndefined();
  },
);

it('projects a legacy Amazon ASIN only when the canonical product path confirms it on Amazon', () => {
  const record = {
    asin: 'B0ABCDEFGH',
    url: 'https://www.amazon.com/dp/B0ABCDEFGH',
    packQty: 4,
    priceUsd: 10,
    checkedAt: '2026-11-16',
  };

  expect(lineIdentity('component:raspberry-pi-pico-2', record)).toMatchObject({
    supplier: 'Amazon',
    supplierPartNumber: 'B0ABCDEFGH',
    orderingUnit: 'pack',
    unitsPerOrder: 4,
  });
  expect(
    lineIdentity('component:raspberry-pi-pico-2', { ...record, url: 'https://evil.example/amazon.com/dp/B0ABCDEFGH' })
      ?.supplierPartNumber,
  ).toBeUndefined();
  expect(
    lineIdentity('component:raspberry-pi-pico-2', { ...record, url: 'https://www.amazon.com/dp/B0ZZZZZZZZ' })
      ?.supplierPartNumber,
  ).toBeUndefined();
});

it('leaves whitespace-only identities unorderable and bounds quantity arithmetic', () => {
  const identity = { supplier: 'DigiKey', supplierPartNumber: 'EXACT', orderingUnit: 'piece', unitsPerOrder: 1 };

  expect(supplierOrderQty(2, { ...identity, supplierPartNumber: '  ' })).toBeUndefined();
  expect(supplierOrderQty(2, { ...identity, orderingUnit: '  ' })).toBeUndefined();
  expect(supplierOrderQty(2, { ...identity, unitsPerOrder: Number.MIN_VALUE })).toBeUndefined();
});
