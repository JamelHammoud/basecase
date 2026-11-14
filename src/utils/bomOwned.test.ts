import { describe, expect, it } from 'vitest';
import { makeSpec } from '../data/hardware';
import type { ProjectSettings, Purchases, ScenePart } from '../types/robotics';
import { bomText, bomToCsv, bomToMarkdown, buildBom, hardwareKey } from './bom';
import { lineUsd } from './budget';
import { budgetRow } from './engineeringBudget';
import { withOnHand, withPrice } from './purchases';

const part = (o: Partial<ScenePart> & { id: string }): ScenePart => ({
  name: o.id,
  kind: 'component',
  category: 'actuators',
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

const SERVO = 'component:feetech-sts3215|c001';
const screw = makeSpec('socket_head', { size: 'M3', length: 12 });
const SCREW = hardwareKey(screw);
const project: ProjectSettings = { printer: 'bambu-p1s', material: 'PLA', infillPct: 20, budgetUsd: 500 };
const servos = Array.from({ length: 8 }, (_, i) =>
  part({ id: `servo${i}`, componentId: 'feetech-sts3215', componentVariant: 'c001' }),
);
const screws = Array.from({ length: 13 }, (_, i) => part({ id: `screw${i}`, kind: 'hardware', hardware: screw }));
const parts = [...servos, ...screws];
const now = new Date('2026-11-13T12:00:00');
const bomWith = (purchases: Purchases) => buildBom({ parts, project, purchases, measures: {}, now });
const line = (purchases: Purchases, key: string) => bomWith(purchases).lines.find((l) => l.key === key)!;

describe('parts on hand', () => {
  const none = bomWith({});
  const owned = bomWith({ [SERVO]: { onHand: 6 }, [SCREW]: { onHand: 100 } });

  it('lists only the servos left to buy and adds only their cost', () => {
    const servo = owned.lines.find((l) => l.key === SERVO)!;

    expect(servo).toMatchObject({ qty: 8, onHand: 6, toBuy: 2, packs: 2, estUsd: 40 });
    expect(none.lines.find((l) => l.key === SERVO)).toMatchObject({ onHand: 0, toBuy: 8, estUsd: 160 });
    expect(none.totals.estimatedUsd - owned.totals.estimatedUsd).toBeCloseTo(120 + lineUsd(line({}, SCREW)), 2);
  });

  it('prices 13 screws at $0 with 100 on hand, and keeps the line', () => {
    expect(owned.lines.find((l) => l.key === SCREW)).toMatchObject({ qty: 13, toBuy: 0, packs: 0, estUsd: 0 });
  });

  it('counts a checked price only for the units to buy', () => {
    const checked = { packQty: 1, priceUsd: 17.5, checkedAt: '2026-11-01' };
    const servo = line({ [SERVO]: { ...checked, onHand: 6 } }, SERVO);

    expect(servo).toMatchObject({ status: 'checked', toBuy: 2, lineUsd: 35 });
    expect(servo.record).toMatchObject(checked);
  });

  it('counts a fully owned part with no known price at $0, not as unpriced', () => {
    const unpriced = none.lines.find((l) => l.estUsd === undefined)!;
    const all = bomWith({ [unpriced.key]: { onHand: unpriced.qty } });

    expect(all.lines.find((l) => l.key === unpriced.key)).toMatchObject({ toBuy: 0, estUsd: 0 });
    expect(all.totals.unpriced).toBe(none.totals.unpriced - 1);
  });

  it('loads an old purchases.json without onHand unchanged', () => {
    const old = { [SERVO]: { packQty: 2, priceUsd: 30, checkedAt: '2026-11-01', asin: 'B0ABCDEFGH' } };
    const servo = line(old, SERVO);

    expect(servo).toMatchObject({ onHand: 0, toBuy: 8, packs: 4, lineUsd: 120, record: old[SERVO] });
  });

  it('tells the agent what is owned and what is left to buy', () => {
    expect(bomText(owned, {})).toContain(`8× Feetech STS3215 7.4 V (C001) [${SERVO}] · 6 owned, 2 to buy`);
  });

  it('exports what is owned beside what is left to buy', () => {
    const [head, ...rows] = bomToCsv(owned, {}).split('\n');
    const cols = head.split(',');
    const servo = rows.find((r) => r.includes('STS3215'))!.split(',');
    const cell = (name: string) => servo[cols.indexOf(name)];

    expect([cell('Qty Needed'), cell('On Hand'), cell('To Buy'), cell('Packs to Buy')]).toEqual(['8', '6', '2', '2']);
    expect(bomToMarkdown(owned, 'Arm')).toContain('| 2 to buy, 6 on hand | 2 |');
    expect(bomToMarkdown(none, 'Arm')).toMatch(/STS3215[^|]*\| 8 \| 8 \|/);
  });

  it('lowers the Budget check by the owned units', () => {
    const row = (purchases: Purchases) =>
      budgetRow({ project, parts, measures: {}, input: { purchases } } as unknown as Parameters<typeof budgetRow>[0]);

    expect(row({}).detail).toMatch(/^BOM ≈ \$\d+/);
    expect(row({ [SERVO]: { onHand: 6 }, [SCREW]: { onHand: 100 } }).detail).toContain(
      `BOM ≈ $${Math.round(owned.totals.estimatedUsd)}`,
    );
  });
});

describe('the purchases record', () => {
  const priced = { packQty: 1, priceUsd: 17.5, checkedAt: '2026-11-01' };

  it('keeps a price when the count changes and the count when the price changes', () => {
    expect(withOnHand(priced, 6)).toEqual({ ...priced, onHand: 6 });
    expect(withOnHand({ ...priced, onHand: 6 }, 0)).toEqual(priced);
    expect(withPrice({ onHand: 6 }, priced)).toEqual({ ...priced, onHand: 6 });
    expect(withPrice({ ...priced, onHand: 6 }, null)).toEqual({ onHand: 6 });
  });

  it('drops a record that holds neither', () => {
    expect(withOnHand({ onHand: 6 }, 0)).toBeNull();
    expect(withOnHand(undefined, 0)).toBeNull();
    expect(withPrice(priced, null)).toBeNull();
  });
});
