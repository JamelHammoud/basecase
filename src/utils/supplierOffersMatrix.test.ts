import { expect, it } from 'vitest';
import { parseBomCsv } from '../../e2e/bomCsv';
import { box } from '../sim/fixtures/parts';
import type { ScenePart, Purchases } from '../types/robotics';
import { buildBom, hardwareKey } from './bom';
import { comparePurchasing, confirmOffer, purchasingCsv } from './supplierOffers';
import { importOffers, OFFER_COLUMNS } from './supplierOfferCsv';
import { csvCell } from './csvCell';

const servo = 'component:feetech-sts3215';
const otherServo = 'component:feetech-sts3250';
const board = 'component:raspberry-pi-pico-2';
const camera = 'component:raspberry-pi-camera-3';
const screw = hardwareKey({ type: 'socket_head', size: 'M3', length: 10 });
const bearing = hardwareKey({ type: 'bearing', size: '608' });
const battery = 'supply:lipo-2s-2200';
const regulator = 'supply:buck-5v-5a';
const filament = 'supply:filament-pla';
const now = '2026-11-20T12:00:00Z';
const plan = { destination: 'US-CA', requiredBy: '2026-12-01' };

type Demand = [key: string, qty: number, owned: number, per: number];

const servoSupplies = (count: number): Demand[] => [
  ['supply:servo-cable-5264-3pin', count, 0, 1],
  ['supply:wire-18awg-silicone', 1, 0, 1],
  ['supply:dc-bench-supply', 1, 0, 1],
  ['supply:blade-fuse-holder', 1, 0, 1],
  ['supply:rocker-switch-20a', 1, 0, 1],
];
const designs: Array<{ name: string; demand: Demand[]; support?: Demand[] }> = [
  { name: 'single-servo arm', demand: [[servo, 1, 0, 1]], support: servoSupplies(1) },
  { name: 'repeated-leg quadruped', demand: [[servo, 12, 2, 4]], support: servoSupplies(12) },
  {
    name: 'mixed-servo hexapod',
    support: servoSupplies(18),
    demand: [
      [servo, 12, 0, 4],
      [otherServo, 6, 1, 2],
    ],
  },
  {
    name: 'rover electronics',
    demand: [
      [board, 2, 1, 1],
      [regulator, 1, 1, 1],
    ],
  },
  {
    name: 'pan-tilt camera',
    support: [...servoSupplies(2), ['supply:pi5-camera-cable-200', 1, 0, 1]],
    demand: [
      [camera, 1, 0, 1],
      [servo, 2, 0, 2],
    ],
  },
  { name: 'gripper hardware', demand: [[screw, 24, 3, 10]] },
  { name: 'conveyor bearings', demand: [[bearing, 16, 3, 4]] },
  {
    name: 'battery and regulator pair',
    support: [
      ['supply:wire-18awg-silicone', 1, 0, 1],
      ['supply:blade-fuse-holder', 1, 0, 1],
      ['supply:lipo-balance-charger', 1, 0, 1],
      ['supply:rocker-switch-20a', 1, 0, 1],
      ['supply:xt60-pigtail', 1, 0, 1],
    ],
    demand: [
      [battery, 1, 0, 1],
      [regulator, 1, 0, 1],
    ],
  },
  { name: 'filament spools', demand: [[filament, 2300, 200, 1000]] },
  {
    name: 'mixed-supplier production quantities',
    support: servoSupplies(240),
    demand: [
      [servo, 240, 2, 12],
      [board, 2401, 1, 1200],
      [screw, 480, 13, 100],
    ],
  },
];

function componentParts(demand: Demand[]): ScenePart[] {
  return demand
    .filter(([key]) => key.startsWith('component:'))
    .flatMap(([key, qty]) =>
      Array.from({ length: qty }, (_, index) => ({
        ...box(`${key}-${index}`, [index * 20, 0, 0], [10, 10, 10], 10),
        kind: 'component' as const,
        componentId: key.slice('component:'.length),
      })),
    );
}

it.each(designs)(
  '$name reconciles generated BOM demand and independent supplier CSV bytes',
  ({ demand: sourceDemand, support = [] }) => {
    const demand = [...sourceDemand, ...support];
    const purchases: Purchases = {};

    for (const [key, , onHand] of demand) {
      purchases[key] = {
        onHand,
        identity: { manufacturer: '製造 Maker', mpn: `000${key}` },
        priceUsd: 1,
        packQty: 1,
        checkedAt: '2026-11-20',
      };
    }

    const parts = componentParts(sourceDemand);
    const extras = demand.filter(([key]) => !key.startsWith('component:')).map(([key, qty]) => ({ key, qty }));
    const bom = buildBom({
      parts,
      project: { printer: 'default', material: 'PLA', infillPct: 15, extras },
      purchases,
      measures: {},
    });
    const expectedTotals: Record<string, number> = {};

    demand.forEach(([key, qty, owned, per], index) => {
      const line = bom.lines.find((item) => item.key === key)!;
      const currency = index % 2 ? 'EUR' : 'USD';
      const cells = [
        '製造 Maker',
        `000${key}`,
        `Shop ${index}`,
        `000${index}`,
        per >= 100 ? 'reel' : 'pack',
        per,
        '1:12|3:10',
        10000,
        currency,
        plan.destination,
        now,
        '',
        '2026-11-23',
        '2026-11-25',
        'https://example.com/quote',
      ];
      const [offer] = importOffers(OFFER_COLUMNS.join(',') + '\n' + cells.map(csvCell).join(',') + '\n', 'quotes.csv');

      purchases[key].supplierOffers = { offers: [confirmOffer(offer, line, per)], selectedId: offer.id };

      const orders = Math.ceil(Math.max(0, qty - owned) / per);

      expectedTotals[currency] = (expectedTotals[currency] ?? 0) + orders * (orders >= 3 ? 10 : 12);
    });

    const result = comparePurchasing({ bom, purchases: JSON.parse(JSON.stringify(purchases)), plan, now });
    const rows = parseBomCsv(purchasingCsv(result));

    demand.forEach(([key, qty, owned, per], index) => {
      const orders = Math.ceil(Math.max(0, qty - owned) / per);

      expect(rows.find((row) => row['Customer Reference'] === key)).toMatchObject({
        'Qty Needed': String(qty),
        'Remaining Units': String(Math.max(0, qty - owned)),
        'On Hand': String(Math.min(qty, owned)),
        'Supplier Order Qty': String(orders),
        'Manufacturer Part Number': `000${key}`,
        'Supplier Part Number': `000${index}`,
        'Units per Order': String(per),
        'Line Total': String(orders * (orders >= 3 ? 10 : 12)),
        'Observed At': now,
        'Import Reference': 'quotes.csv:2',
      });
    });
    expect(result.totals).toEqual(expectedTotals);
    expect(result.purchasingComplete).toBe(true);
    expect(result.estimatedArrival).toBe('2026-11-25');
  },
);
