import { describe, expect, it } from 'vitest';
import { customModel, type PrinterSetup } from '../data/printers';
import { bedOf, fitOnBed, overlaps, placementFits } from './bed';
import { packPlates } from './pack';
import { buildPrintPlan, choosePose } from './plan';
import { planInput } from './plan.fixtures';
import { jobSpec } from './job';
import { plateFootprint, plateOnBed } from './fleet';
import { DEFAULT_PROJECT } from '../types/robotics';

const model = () => ({
  ...customModel({ width: 100, depth: 100, height: 100 }),
  obstacles: [
    {
      polygon: [
        [40, 0],
        [50, 0],
        [50, 45],
        [40, 45],
      ] as [number, number][],
      zMin: 0,
      zMax: 3,
    },
    {
      polygon: [
        [70, 70],
        [90, 70],
        [90, 90],
        [70, 90],
      ] as [number, number][],
      zMin: 0,
      zMax: 60,
    },
  ],
  toolheadClearance: { radius: 5, height: 20 },
});

const setup = (): PrinterSetup => ({ id: 'fixture', label: 'Fixture', model: model(), nozzle: 0.4, mine: null });

const shape = (size: [number, number, number]) => {
  const input = planInput('part', size);

  return { poses: [input.check.pose], minWallMm: 2, thinShare: 0, thinAreaMm2: 0 };
};

describe('printer obstacle placement', () => {
  it('reserves low clips and tall docks with the shared conservative toolhead envelope', () => {
    const bed = bedOf(model());

    expect(bed.keepOut).toEqual([
      { x: 35, y: 0, w: 20, d: 50 },
      { x: 65, y: 65, w: 30, d: 30 },
    ]);
    expect(placementFits({ x: 25, y: 0, w: 10, d: 20 }, bed)).toBe(true);
    expect(placementFits({ x: 25.01, y: 0, w: 10, d: 20 }, bed)).toBe(false);
    expect(fitOnBed(100, 100, 1, bed)).toBeNull();
    expect(fitOnBed(100, 100, 80, bed)).toBeNull();
  });

  it('keeps automatic, rotated and manual placements clear and refuses unsafe fixed placement', () => {
    const bed = bedOf(model());
    const packed = packPlates(
      [
        { id: 'a', w: 30, d: 50 },
        { id: 'b', w: 60, d: 20 },
      ],
      bed,
    );

    expect(Object.keys(packed.placements)).toHaveLength(2);

    for (const placement of Object.values(packed.placements)) {
      expect(placementFits(placement, bed)).toBe(true);
      expect(bed.keepOut.some((obstacle) => overlaps(placement, obstacle))).toBe(false);
    }

    const print = { at: [30, 0] as [number, number], plate: 1, turned: true };
    const check = choosePose(shape([10, 30, 10]), bed, print);

    expect(check.fits).toBe(false);
    expect(
      packPlates([{ id: 'bad', w: 10, d: 30, fixed: { x: 30, y: 0, plate: 1, turned: true } }], bed).placements,
    ).toEqual({});
  });

  it('packs exact fits beside obstacles without charging the inter-part gap against a bed exclusion', () => {
    const printer = {
      ...customModel({ width: 100, depth: 100, height: 100 }),
      keepOut: [
        [
          [40, 0],
          [50, 0],
          [50, 100],
          [40, 100],
        ] as [number, number][],
      ],
    };
    const bed = bedOf(printer);

    expect(fitOnBed(50, 100, 10, bed)).not.toBeNull();
    expect(packPlates([{ id: 'exact', w: 50, d: 100 }], bed).placements.exact).toMatchObject({
      x: 50,
      y: 0,
      w: 50,
      d: 100,
    });
  });

  it('uses rotated extents when moving a diagonal plate to another printer', () => {
    const bed = bedOf(customModel({ width: 100, depth: 100, height: 100 }));
    const plan = buildPrintPlan(
      [planInput('diagonal', [110, 10, 5], { check: { ...planInput('diagonal', [110, 10, 5]).check, yaw: 45 } })],
      setup(),
      bed,
      '',
    );
    const plate = plan.plates[0];
    const footprint = plateFootprint(plate);

    expect(footprint.d).toBeCloseTo(120 / Math.SQRT2);
    expect(plateOnBed(plate, bed, bedOf(customModel({ width: 120, depth: 20, height: 100 })))).toBeNull();
  });

  it('adds brim clearance to the bed edge and obstacle envelope', () => {
    const bed = bedOf({ ...model(), brimClearance: 3 });

    expect(placementFits({ x: 0, y: 50, w: 10, d: 10 }, bed)).toBe(false);
    expect(placementFits({ x: 3, y: 53, w: 10, d: 10 }, bed)).toBe(true);
    expect(placementFits({ x: 23, y: 3, w: 10, d: 10 }, bed)).toBe(false);
  });

  it('uses the selected quality preset brim and changes results when height metadata changes', () => {
    const printer = model();
    const presets = {
      machine: 'Fixture',
      process: 'Default',
      filaments: {},
      processes: [
        { name: 'Wide brim', layer: 0.2, brimClearance: 8 },
        { name: 'No brim', layer: 0.1, brimClearance: 0 },
      ],
    };
    const bed = bedOf({ ...printer, presets }, 'Wide brim');

    expect(bed.margin).toBe(8);
    expect(bedOf({ ...printer, presets, brimClearance: 4 }, 'No brim').margin).toBe(0);
    expect(placementFits({ x: 5, y: 60, w: 10, d: 10 }, bed)).toBe(false);
    expect(
      bedOf({ ...printer, obstacles: printer.obstacles.map((o) => ({ ...o, zMax: o.zMax + 1 })) }).obstacleKey,
    ).not.toBe(bedOf(printer).obstacleKey);
  });

  it('fails unsupported geometry and preserves legacy obstacle-free packing', () => {
    const legacy = bedOf(customModel({ width: 100, depth: 100, height: 100 }));
    const unsupported = bedOf({ ...model(), obstacleUnsupported: true });

    expect(fitOnBed(100, 100, 100, legacy)).not.toBeNull();
    expect(packPlates([{ id: 'full', w: 100, d: 100 }], legacy).placements.full).toMatchObject({ x: 0, y: 0 });
    expect(fitOnBed(1, 1, 1, unsupported)).toBeNull();
    expect(packPlates([{ id: 'bad', w: 1, d: 1 }], unsupported).placements).toEqual({});
  });

  it('exports the packed transform and invalidates hashes when obstacle settings change', () => {
    const printer = setup();
    const input = planInput('part', [20, 20, 10]);
    const plan = buildPrintPlan([input], printer, bedOf(printer.model), '');
    const item = plan.plates[0].items[0];

    expect(placementFits(item, plan.bed)).toBe(true);
    expect(item.matrix[12]).toBe(item.x + item.w / 2 - 10);
    expect(item.matrix[13]).toBe(item.y + item.d);
    expect(jobSpec(plan, printer, DEFAULT_PROJECT).files[0].items[0].matrix).toEqual(item.matrix);

    const changed = buildPrintPlan(
      [input],
      printer,
      bedOf({ ...printer.model, toolheadClearance: { radius: 6, height: 20 } }),
      '',
    );

    expect(changed.plates[0].hash).not.toBe(plan.plates[0].hash);
  });
});

describe('printer height validation', () => {
  it.each([
    [100.0000005, true],
    [100.000002, false],
    [0, false],
    [-1, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
  ])('uses the same height validation for automatic and fixed poses at %s mm', (height, fits) => {
    const bed = bedOf(model());
    const printShape = shape([10, 10, height]);

    expect(choosePose(printShape, bed).fits).toBe(fits);
    expect(choosePose(printShape, bed, { at: [0, 0], plate: 1 }).fits).toBe(fits);
  });
});
