import { describe, expect, it } from 'vitest';
import { makeSpec } from '../../data/hardware';
import type { MeshMeasure } from '../../three/meshMeasure';
import type { ProjectSettings, PurchaseRecord, Purchases, ScenePart } from '../../types/robotics';
import { buildBom, hardwareKey } from '../../utils/bom';
import type { BomLine } from '../../utils/bomTypes';
import { bomCart } from './cart';

const part = (o: Partial<ScenePart> & { id: string }): ScenePart => ({
  name: o.id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#fff',
  note: '',
  visible: true,
  locked: false,
  ...o,
});

const measure = (volumeMm3: number): MeshMeasure => ({
  volumeMm3,
  areaMm2: 6000,
  min: [0, 0, 0],
  max: [40, 20, 10],
  centroid: [20, 10, 5],
  triangles: 12,
});

const record = (asin: string, packQty: number): PurchaseRecord => ({
  url: `https://www.amazon.com/dp/${asin}`,
  asin,
  packQty,
  priceUsd: 10,
  checkedAt: '2026-11-01',
});

const project: ProjectSettings = { printer: 'bambu-p1s', material: 'PLA', infillPct: 20 };
const screw = makeSpec('socket_head', { size: 'M3', length: 6 });
const servoKey = 'component:feetech-sts3215';
const arm = [
  ...Array.from({ length: 6 }, (_, i) =>
    part({ id: `servo${i}`, name: 'STS3215', kind: 'component', componentId: 'feetech-sts3215' }),
  ),
  part({ id: 'adapter', kind: 'component', componentId: 'waveshare-bus-servo-adapter-a' }),
  ...Array.from({ length: 13 }, (_, i) => part({ id: `screw${i}`, kind: 'hardware', hardware: screw })),
  part({ id: 'base', name: 'Base', kind: 'cad_part' }),
  part({ id: 'upper', name: 'Upper arm', kind: 'cad_part' }),
];
const armBom = (purchases: Purchases) =>
  buildBom({
    parts: arm,
    project,
    purchases,
    measures: { base: measure(60000), upper: measure(40000) },
    now: new Date('2026-11-13T12:00:00'),
  });
const priced = armBom({ [servoKey]: record('B0SERVO002', 2), [hardwareKey(screw)]: record('B0SCREW100', 100) });

const line = (o: Partial<BomLine> & { key: string }): BomLine => ({
  category: 'Components',
  name: o.key,
  detail: '',
  qty: 1,
  owned: 0,
  toBuy: o.qty ?? 1,
  unit: 'pcs',
  partIds: [],
  urlKind: 'none',
  status: 'unchecked',
  ...o,
});

describe('bomCart', () => {
  it('fills one Amazon cart in line order, rounded up to whole packs', () => {
    expect(bomCart(priced.lines).amazonUrl).toBe(
      'https://www.amazon.com/gp/aws/cart/add.html?' +
        'ASIN.1=B0SERVO002&Quantity.1=3&ASIN.2=B0CJ6TP3TP&Quantity.2=1&ASIN.3=B0SCREW100&Quantity.3=1',
    );
  });

  it('buys 6 servos sold in pairs as 3 packs and 13 screws sold by the hundred as 1', () => {
    const { items } = bomCart(priced.lines);

    expect(items.find((i) => i.key === servoKey)?.quantity).toBe(3);
    expect(items.find((i) => i.key === hardwareKey(screw))?.quantity).toBe(1);
  });

  it('buys only what is left past the parts on hand, and nothing of a line fully owned', () => {
    const owning = (servos: number) =>
      bomCart(
        armBom({
          [servoKey]: { ...record('B0SERVO002', 2), onHand: servos },
          [hardwareKey(screw)]: { ...record('B0SCREW100', 100), onHand: 100 },
        }).lines,
      ).items;

    expect(owning(4).find((i) => i.key === servoKey)?.quantity).toBe(1);
    expect(owning(6).map((i) => i.key)).toEqual(['component:waveshare-bus-servo-adapter-a']);
  });

  it('keeps lines with no ASIN out of the Amazon cart', () => {
    const cart = bomCart(armBom({}).lines);
    const asinKeys = cart.items.map((i) => i.key);

    expect(asinKeys).toEqual([servoKey, 'component:waveshare-bus-servo-adapter-a']);
    expect(cart.amazonUrl).not.toContain('Quantity.3');
    expect(cart.stores.flatMap((s) => s.links.map((l) => l.key))).toContain('supply:filament-pla');
    expect(cart.unlinked.length).toBeGreaterThan(0);
  });

  it('drops a store link that is not https and an ASIN that fails parseAsin', () => {
    const cart = bomCart([
      line({ key: 'plain', url: 'http://shop.example.com/servo', urlKind: 'product' }),
      line({ key: 'script', url: 'javascript:alert(1)', urlKind: 'product' }),
      line({ key: 'short', url: 'https://www.amazon.com/dp/B0SHORT', urlKind: 'product' }),
      line({
        key: 'forged',
        url: 'https://www.amazon.com/dp/B0G39SM9HZ',
        urlKind: 'product',
        record: { ...record('B0G39SM9HZ', 1), asin: 'B0G39SM9HZ&ASIN.9=X' },
      }),
      line({ key: 'lookalike', url: 'https://amazon.com.example.net/dp/B0G39SM9HZ', urlKind: 'product' }),
    ]);

    expect(cart.amazonUrl).toBeUndefined();
    expect(cart.stores.map((s) => s.store)).toEqual(['amazon.com.example.net']);
    expect(cart.unlinked.map((l) => l.key)).toEqual(['plain', 'script', 'short', 'forged']);
  });

  it('groups confirmed store links by store, from saved listings and list prices', () => {
    const cart = bomCart([
      line({ key: 'a', name: 'Servo', url: 'https://www.seeedstudio.com/servo', urlKind: 'product' }),
      line({
        key: 'b',
        name: 'Cooler',
        url: 'https://www.amazon.com/s?k=cooler',
        urlKind: 'search',
        estimate: { usd: 13.5, per: 1, store: 'Adafruit', url: 'https://www.adafruit.com/product/5815', seen: '' },
      }),
      line({ key: 'c', name: 'Board', url: 'https://www.seeedstudio.com/board', urlKind: 'product' }),
    ]);

    expect(cart.stores).toEqual([
      {
        store: 'seeedstudio.com',
        links: [
          { key: 'a', name: 'Servo', url: 'https://www.seeedstudio.com/servo' },
          { key: 'c', name: 'Board', url: 'https://www.seeedstudio.com/board' },
        ],
      },
      { store: 'adafruit.com', links: [{ key: 'b', name: 'Cooler', url: 'https://www.adafruit.com/product/5815' }] },
    ]);
  });

  it('lists every bought part of an arm exactly once', () => {
    const cart = bomCart(priced.lines);
    const listed = [
      ...cart.items.map((i) => i.key),
      ...cart.stores.flatMap((s) => s.links.map((l) => l.key)),
      ...cart.unlinked.map((l) => l.key),
    ];

    expect(listed.toSorted()).toEqual(priced.lines.map((l) => l.key).toSorted());
    expect(new Set(listed).size).toBe(listed.length);
  });
});
