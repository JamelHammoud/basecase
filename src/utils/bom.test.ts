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

const project: ProjectSettings = { printer: 'bambu-p1s', material: 'PLA', infillPct: 20, budgetUsd: 50 };
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
    expect(bom.lines.map((l) => [l.key, l.qty, l.category])).toEqual([
      ['component:feetech-sts3215|c001', 1, 'Components'],
      [hardwareKey(screw), 2, 'Hardware'],
      ['supply:lipo-2s-2200', 1, 'Supplies'],
      ['supply:filament-pla', 13, 'Filament'],
    ]);
    expect(line(hardwareKey(screw)).partIds).toEqual(['s1', 's2']);
    expect(line('supply:filament-pla')).toMatchObject({ unit: 'g', packs: 1, partIds: ['bracket'] });
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
    expect(bom.totals).toMatchObject({ checked: 0, stale: 0, unchecked: 4, budgetUsd: 50, overBudget: false });
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
    expect(bomText(priced, {})).toContain('Budget $50.00. Checked prices total $26.49 (1 checked, 1 stale).');
  });
});
