import { describe, expect, it } from 'vitest';
import { makeSpec } from '../data/hardware';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { bomText, buildBom, hardwareKey } from './bom';

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

const measure = (volumeMm3: number, areaMm2: number): MeshMeasure => ({
  volumeMm3,
  areaMm2,
  min: [0, 0, 0],
  max: [40, 20, 10],
  centroid: [20, 10, 5],
  triangles: 12,
});

const project: ProjectSettings = { printer: 'bambu-p1s', material: 'PLA', infillPct: 20, budgetUsd: 100 };
const screw = makeSpec('socket_head', { size: 'M3', length: 12 });
const parts = [
  part({ id: 'servo', name: 'Hip servo', kind: 'component', componentId: 'feetech-sts3215', componentVariant: 'c001' }),
  part({ id: 's1', kind: 'hardware', hardware: screw }),
  part({ id: 's2', kind: 'hardware', hardware: screw }),
  part({ id: 'bracket', name: 'Bracket', kind: 'cad_part' }),
  part({ id: 'battery', name: 'Battery', supplyId: 'lipo-2s-2200' }),
  part({ id: 'standin', name: 'Generic servo', kind: 'servo' }),
  part({ id: 'hole', role: 'cutout' }),
];
const measures = { bracket: measure(20000, 6000) };

describe('buildBom', () => {
  const bom = buildBom({ parts, project, purchases: {}, measures, now: new Date('2026-10-18T12:00:00') });
  const line = (key: string) => bom.lines.find((l) => l.key === key)!;

  it('counts catalog parts, same-spec hardware and supplies by key', () => {
    expect(bom.lines.map((l) => [l.key, l.qty, l.category])).toEqual(
      expect.arrayContaining([
        ['component:feetech-sts3215|c001', 1, 'Components'],
        [hardwareKey(screw), 2, 'Hardware'],
        ['supply:lipo-2s-2200', 1, 'Supplies'],
        ['supply:filament-pla', 13, 'Filament'],
      ]),
    );
    expect(line(hardwareKey(screw)).partIds).toEqual(['s1', 's2']);
    expect(line('supply:filament-pla')).toMatchObject({ unit: 'g', packs: 1, partIds: ['bracket'] });
  });

  it("adds what the scene needs by itself: cables for servos, the LiPo's power path, keys for screws", () => {
    expect(line('supply:servo-cable-5264-3pin').qty).toBe(1);
    expect(line('supply:xt60-pigtail').qty).toBe(1);
    expect(line('supply:blade-fuse-holder').qty).toBe(1);
    expect(line('supply:rocker-switch-20a').qty).toBe(1);
    expect(line('supply:lipo-balance-charger').qty).toBe(1);
    expect(line('supply:hex-key-set').category).toBe('Equipment');
  });

  it('fills in only the wiring the extras leave out', () => {
    const extras = [
      { key: 'supply:servo-cable-5264-3pin', qty: 6 },
      { key: 'supply:xt60-pigtail', qty: 1 },
    ];
    const listed = buildBom({ parts, project: { ...project, extras }, purchases: {}, measures });
    const qty = (key: string) => listed.lines.find((l) => l.key === key)?.qty;

    expect(qty('supply:servo-cable-5264-3pin')).toBe(6);
    expect(qty('supply:xt60-pigtail')).toBe(1);
  });

  it('weighs printed parts from the shell and infill model', () => {
    expect(bom.printed).toHaveLength(1);
    expect(bom.printed[0]).toMatchObject({ id: 'bracket', material: 'PLA', size: [40, 20, 10] });
    expect(bom.printed[0].grams).toBeCloseTo(10.4832, 4);
    expect(bom.filamentG.PLA).toBeCloseTo(10.4832, 4);
  });

  it('lists stand-ins and prices unchecked lines from list prices', () => {
    expect(bom.standIns).toEqual([{ id: 'standin', name: 'Generic servo' }]);
    expect(bom.unmeasured).toEqual([]);
    expect(line('component:feetech-sts3215|c001')).toMatchObject({ status: 'unchecked', estUsd: 20 });
    expect(bom.totals).toMatchObject({ checked: 0, stale: 0, budgetUsd: 100, overBudget: false });
  });

  it('applies checked prices and flags stale ones', () => {
    const priced = buildBom({
      parts,
      project,
      purchases: {
        'component:feetech-sts3215|c001': {
          url: 'https://www.amazon.com/dp/B0ABCDEFGH',
          asin: 'B0ABCDEFGH',
          title: 'Servo',
          packQty: 1,
          priceUsd: 17.5,
          checkedAt: '2026-10-01',
        },
        [hardwareKey(screw)]: {
          url: '',
          asin: 'B0X',
          title: 'Screws',
          packQty: 100,
          priceUsd: 8.99,
          checkedAt: '2026-01-01',
        },
      },
      measures,
      now: new Date('2026-10-18T12:00:00'),
    });

    expect(priced.lines[0]).toMatchObject({ status: 'checked', urlKind: 'product', lineUsd: 17.5 });
    expect(priced.lines[1]).toMatchObject({ status: 'stale', packs: 1, lineUsd: 8.99 });
    expect(priced.totals).toMatchObject({ checkedUsd: 17.5, pricedUsd: 26.49, checked: 1, stale: 1 });
    expect(bomText(priced, {})).toContain('Budget $100.00. Checked prices total $26.49 (1 checked, 1 stale).');
  });
});

describe('parts on hand', () => {
  const servoKey = 'component:feetech-sts3215|c001';
  const servos = Array.from({ length: 8 }, (_, i) =>
    part({ id: `servo${i}`, kind: 'component', componentId: 'feetech-sts3215', componentVariant: 'c001' }),
  );
  const screws = Array.from({ length: 13 }, (_, i) => part({ id: `screw${i}`, kind: 'hardware', hardware: screw }));
  const checked = { packQty: 1, priceUsd: 17.5, checkedAt: '2026-11-01' };
  const now = new Date('2026-11-13T12:00:00');
  const bomWith = (purchases: Parameters<typeof buildBom>[0]['purchases']) =>
    buildBom({ parts: [...servos, ...screws], project, purchases, measures: {}, now });
  const lineOf = (bom: ReturnType<typeof buildBom>, key: string) => bom.lines.find((l) => l.key === key)!;

  it('buys only the servos past the ones on hand, and adds only their cost', () => {
    const none = bomWith({ [servoKey]: checked });
    const six = bomWith({ [servoKey]: { ...checked, onHand: 6 } });

    expect(lineOf(six, servoKey)).toMatchObject({ qty: 8, owned: 6, toBuy: 2, packs: 2, lineUsd: 35 });
    expect(lineOf(none, servoKey)).toMatchObject({ owned: 0, toBuy: 8, lineUsd: 140 });
    expect(none.totals.estimatedUsd - six.totals.estimatedUsd).toBeCloseTo(105, 2);
  });

  it('counts a part owned with no checked price, and its list price only for what is left to buy', () => {
    const line = lineOf(bomWith({ [servoKey]: { onHand: 6 } }), servoKey);

    expect(line).toMatchObject({ record: undefined, status: 'unchecked', owned: 6, toBuy: 2, estUsd: 40 });
  });

  it('costs nothing for 13 M3 screws with 100 on hand', () => {
    const bom = bomWith({ [hardwareKey(screw)]: { onHand: 100 } });
    const line = lineOf(bom, hardwareKey(screw));

    expect(line).toMatchObject({ qty: 13, owned: 13, toBuy: 0, packs: 0, lineUsd: 0 });
    expect(bom.totals.unpriced).toBe(bomWith({}).totals.unpriced);
    expect(bom.totals.estimatedUsd).toBeLessThan(bomWith({}).totals.estimatedUsd);
  });

  it('keeps an old price from flagging a line the user owns in full', () => {
    const old = { ...checked, checkedAt: '2026-08-01' };

    expect(lineOf(bomWith({ [servoKey]: { ...old, onHand: 8 } }), servoKey).status).toBe('checked');
    expect(lineOf(bomWith({ [servoKey]: { ...old, onHand: 6 } }), servoKey).status).toBe('stale');
  });

  it('tells the agent what is owned and what is left to buy', () => {
    const text = bomText(bomWith({ [servoKey]: { ...checked, onHand: 6 } }), {});

    expect(text).toContain(`8× Feetech STS3215 7.4 V (C001) [${servoKey}] · 6 owned, 2 to buy`);
  });

  it('reads an old record without a count as owning none', () => {
    const old = { url: 'https://www.amazon.com/dp/B0ABCDEFGH', asin: 'B0ABCDEFGH', ...checked };

    expect(lineOf(bomWith({ [servoKey]: old }), servoKey)).toMatchObject({ record: old, owned: 0, toBuy: 8 });
  });
});
