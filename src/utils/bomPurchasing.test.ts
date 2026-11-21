import { expect, it } from 'vitest';
import { parseBomCsv } from '../../e2e/bomCsv';
import { bomCart } from '../components/build/cart';
import { initialPurchaseForm, purchaseRecord } from '../components/build/purchaseForm';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { PurchaseIdentity } from '../types/purchasing';
import type { Purchases } from '../types/robotics';
import { buildBom, bomToCsv } from './bom';

const robot = fixtureRobots().find((r) => r.id === 'arm-3dof') ?? fixtureRobots()[0];
const parts = Array.from({ length: 6 }, (_, i) => ({
  ...robot.parts[0],
  id: `servo-${i}`,
  kind: 'component' as const,
  componentId: 'feetech-sts3215',
  componentVariant: undefined,
}));
const project = { printer: 'default', material: 'PLA' as const, infillPct: 15 };
const key = 'component:feetech-sts3215';
const identity: PurchaseIdentity = {
  manufacturer: 'Feetech',
  mpn: 'STS3215',
  supplier: 'DigiKey',
  supplierPartNumber: 'TEST-CT-ND',
  orderingUnit: 'piece',
  unitsPerOrder: 1,
  sourceUrl: 'https://www.digikey.com/en/products/detail/test',
};
const record = { url: identity.sourceUrl, identity, priceUsd: 12, packQty: 1, checkedAt: '2026-11-16' };
const make = (purchases: Purchases) => buildBom({ parts, project, purchases, measures: {} });
const exported = (purchases: Purchases) =>
  parseBomCsv(bomToCsv(make(purchases), {})).find((r) => r['Customer Reference'] === key)!;

it.each([
  { name: 'exact supplier', onHand: 0, remaining: '6' },
  { name: 'partial stock', onHand: 2, remaining: '4' },
  { name: 'fully owned', onHand: 9, remaining: '0' },
])('$name retains exact identity and unit quantities', ({ onHand, remaining }) => {
  const row = exported({ [key]: { ...record, onHand } });

  expect(row).toMatchObject({
    'Qty Needed': '6',
    'Remaining Units': remaining,
    Manufacturer: 'Feetech',
    'Manufacturer Part Number': 'STS3215',
    Supplier: 'DigiKey',
    'Supplier Part Number': 'TEST-CT-ND',
    'Supplier Order Qty': remaining,
    'Ordering Unit': 'piece',
    'Units per Order': '1',
    'Identity Source': identity.sourceUrl,
    'Component References': parts.map((p) => p.id).join('; '),
  });
});

it('keeps multipacks and packaging-specific identifiers separate from remaining pieces', () => {
  const purchases = {
    [key]: {
      ...record,
      packQty: 4,
      onHand: 1,
      asin: 'B0ABCDEFGH',
      identity: {
        ...identity,
        supplier: 'Amazon',
        supplierPartNumber: 'B0ABCDEFGH',
        orderingUnit: 'pack',
        unitsPerOrder: 4,
      },
    },
  };
  const row = exported(purchases);

  expect(row).toMatchObject({
    'Remaining Units': '5',
    'Supplier Order Qty': '2',
    'Ordering Unit': 'pack',
    'Packs to Buy': '2',
  });
  expect(bomCart(make(purchases).lines).amazonUrl).toContain('Quantity.1=2');
  expect(make(purchases).lines.find((l) => l.key === key)?.lineUsd).toBe(24);
  expect(
    exported({
      [key]: {
        ...record,
        identity: { ...identity, supplierPartNumber: 'TEST-REEL', orderingUnit: 'reel', unitsPerOrder: 100 },
      },
    }),
  ).toMatchObject({
    'Supplier Part Number': 'TEST-REEL',
    'Supplier Order Qty': '1',
    'Ordering Unit': 'reel',
    'Remaining Units': '6',
  });
});

it('leaves unknown conversions explicit and never borrows the listing pack size', () => {
  const row = exported({ [key]: { ...record, packQty: 50, identity: { ...identity, unitsPerOrder: undefined } } });

  expect(row).toMatchObject({
    'Remaining Units': '6',
    'Supplier Order Qty': '',
    'Units per Order': '',
    'Ordering Unit': 'piece',
  });
});

it('exports manufacturer-only and unknown identity without guessing from names or URLs', () => {
  expect(exported({ [key]: { ...record, identity: { manufacturer: 'Maker', mpn: 'Exact' } } })).toMatchObject({
    Manufacturer: 'Maker',
    'Manufacturer Part Number': 'Exact',
    Supplier: '',
    'Supplier Part Number': '',
    'Supplier Order Qty': '',
  });

  const unknown = buildBom({
    parts: [],
    project: { ...project, extras: [{ key: 'supply:wire-18awg-silicone', qty: 1 }] },
    purchases: {},
    measures: {},
  });

  const row = parseBomCsv(bomToCsv(unknown, {})).find((r) => r['Customer Reference'] === 'supply:wire-18awg-silicone');

  expect(row).toMatchObject({
    Manufacturer: '',
    'Manufacturer Part Number': '',
    'Supplier Part Number': '',
    'Remaining Units': '1',
  });
});

it('retains a reel identifier and refuses to treat it as a piece quantity', () => {
  expect(
    exported({
      [key]: {
        ...record,
        identity: { ...identity, supplierPartNumber: 'TEST-TR-ND', orderingUnit: 'reel', unitsPerOrder: 3000 },
      },
    }),
  ).toMatchObject({
    'Supplier Part Number': 'TEST-TR-ND',
    'Ordering Unit': 'reel',
    'Units per Order': '3000',
    'Supplier Order Qty': '1',
    'Remaining Units': '6',
  });
});

it('keeps mixed suppliers on their own lines and preserves the declared total and costs', () => {
  const wire = 'supply:wire-18awg-silicone';
  const input = {
    parts,
    project: { ...project, extras: [{ key: wire, qty: 3 }] },
    measures: {},
    purchases: {
      [key]: record,
      [wire]: {
        ...record,
        packQty: 2,
        identity: {
          manufacturer: 'Wire maker',
          mpn: 'W18',
          supplier: 'Mouser',
          supplierPartNumber: 'M-W18',
          orderingUnit: 'pack',
          unitsPerOrder: 2,
        },
      },
    },
  };
  const bom = buildBom(input);
  const rows = parseBomCsv(bomToCsv(bom, {}));

  expect(rows.find((r) => r['Customer Reference'] === wire)).toMatchObject({
    Supplier: 'Mouser',
    'Supplier Part Number': 'M-W18',
    'Remaining Units': '3',
    'Supplier Order Qty': '2',
  });
  expect(rows.find((r) => r['Customer Reference'] === key)).toMatchObject({
    Supplier: 'DigiKey',
    'Remaining Units': '6',
  });
  expect(bom.lines.find((l) => l.key === key)).toMatchObject({ qty: 6, lineUsd: 72 });
  expect(bom.lines.find((l) => l.key === wire)).toMatchObject({ qty: 3, lineUsd: 24 });
});

it('round trips commas, quotes, Unicode and formula-like identities as literal spreadsheet text', () => {
  const row = exported({
    [key]: {
      ...record,
      title: '=HYPERLINK("bad")',
      identity: { ...identity, manufacturer: 'Maker, "μ"\n工', mpn: '=1+1', supplierPartNumber: '@SUM(1)' },
    },
  });

  expect(row).toMatchObject({
    Manufacturer: 'Maker, "μ"\n工',
    'Manufacturer Part Number': "'=1+1",
    'Supplier Part Number': "'@SUM(1)",
    'Listing Title': '\'=HYPERLINK("bad")',
  });
});

it('retains corrections after reload without merging conflicting catalog identities', () => {
  const line = make({ [key]: record }).lines.find((l) => l.key === key)!;
  const form = initialPurchaseForm(line);
  const changed = purchaseRecord({
    ...form,
    url: 'https://www.mouser.com/new',
    identity: {
      manufacturer: 'Other',
      mpn: 'OTHER',
      supplier: 'Mouser',
      supplierPartNumber: 'NEW',
      orderingUnit: 'piece',
      unitsPerOrder: 1,
    },
  });
  const reloaded = JSON.parse(JSON.stringify({ [key]: changed })) as Purchases;

  expect(exported(reloaded)).toMatchObject({
    Manufacturer: 'Other',
    'Manufacturer Part Number': 'OTHER',
    Supplier: 'Mouser',
    'Supplier Part Number': 'NEW',
    'Remaining Units': '6',
  });
});

it('uses the latest purchase edits after pending wiring preparation and rejects stale scenes', async () => {
  const { bomWiring, wiringForScene } = await import('../components/build/bomWiring');
  const { wiringNetlist } = await import('../wiring/netlist');
  const source = bomWiring();
  const scene = { parts, project };
  let complete!: (wiring: ReturnType<typeof wiringNetlist>) => void;
  const pending = new Promise<ReturnType<typeof wiringNetlist>>((resolve) => {
    complete = resolve;
  });
  const ready = new Promise<void>((resolve) => source.subscribe(resolve));

  source.load(scene, () => pending);
  expect(wiringForScene(source.snapshot(), scene)).toBeUndefined();

  const purchases: Purchases = {
    [key]: { ...record, onHand: 4, identity: { ...identity, supplierPartNumber: 'EDITED-CT-ND' } },
  };

  complete(wiringNetlist(scene));
  await ready;

  const bom = buildBom({ ...scene, purchases, measures: {}, wiring: wiringForScene(source.snapshot(), scene) });
  const row = parseBomCsv(bomToCsv(bom, {})).find((r) => r['Customer Reference'] === key);

  expect(row).toMatchObject({ 'Remaining Units': '2', 'Supplier Part Number': 'EDITED-CT-ND' });
  expect(wiringForScene(source.snapshot(), { ...scene, parts: [...parts] })).toBeUndefined();
});

it('keeps every repeated component reference stable beyond the Used By display limit', () => {
  const repeated = Array.from({ length: 14 }, (_, i) => ({
    ...parts[0],
    id: `repeat-${String(i).padStart(2, '0')}`,
    name: 'Same name',
  }));
  const bom = buildBom({ parts: repeated, project, purchases: { [key]: record }, measures: {} });
  const rows = parseBomCsv(bomToCsv(bom, Object.fromEntries(repeated.map((p) => [p.id, p.name]))));
  const renamed = parseBomCsv(bomToCsv(bom, Object.fromEntries(repeated.map((p) => [p.id, 'Renamed']))));
  const row = rows.find((r) => r['Customer Reference'] === key)!;

  expect(row['Remaining Units']).toBe('14');
  expect(row['Component References'].split('; ')).toEqual(repeated.map((p) => p.id));
  expect(renamed.find((r) => r['Customer Reference'] === key)?.['Component References']).toBe(
    row['Component References'],
  );
});
