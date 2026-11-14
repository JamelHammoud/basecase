import { describe, expect, it } from 'vitest';
import { printerModel, resolvePrinter, type MyPrinter } from '../data/printers';
import type { PrintRecord } from '../types/robotics';
import { bedOf } from './bed';
import { nextPlate, offeredTo, plateFootprint, plateOnBed, type FleetPrinter } from './fleet';
import { buildPrintPlan } from './plan';
import { planInput } from './plan.fixtures';
import type { PrinterStatus } from './printBridge';
import { printRecordFor, withRecord } from './tracker';

const mine = (id: string, modelId: string): MyPrinter => ({
  id,
  modelId,
  nickname: id,
  nozzle: 0.4,
  connection: { kind: 'moonraker', host: '127.0.0.1' },
});

const fleet = (id: string, modelId: string, status: PrinterStatus | null = { state: 'idle' }): FleetPrinter => ({
  setup: resolvePrinter(id, [mine(id, modelId)]),
  status,
});

const scene = resolvePrinter('bambu-lab-p1s', []);
const bed = bedOf(scene.model);

const plan = buildPrintPlan(
  [
    planInput('base', [220, 220, 20], { firstStep: 0 }),
    planInput('leg', [120, 60, 30], { firstStep: 1 }),
    planInput('shell', [150, 150, 40], { firstStep: 2, material: 'PETG' }),
  ],
  scene,
  bed,
  'fine',
);
const [base, leg, shell] = plan.plates;

const sent = (records: PrintRecord[], plate: (typeof plan.plates)[number], state: PrintRecord['state'] = 'sent') =>
  withRecord(records, {
    ...printRecordFor(plate, { parts: [], keyOf: () => '', printer: 'p', now: new Date(plate.number * 1000) }),
    state,
  });

describe('which printers a plate is offered to', () => {
  it('never offers a plate to a printer whose bed can’t hold it', () => {
    const mini = fleet('mini', 'bambu-lab-a1-mini');

    expect(plateFootprint(base).w).toBeGreaterThan(bedOf(printerModel('bambu-lab-a1-mini')!).width);
    expect(offeredTo(base, mini, scene)).toBe(false);
    expect(offeredTo(leg, mini, scene)).toBe(true);
    expect(nextPlate({ plates: plan.plates, records: [], printer: mini, scene })?.number).toBe(leg.number);
  });

  it('never offers a PLA plate to a printer that reports PETG loaded', () => {
    const petg = fleet('x1', 'bambu-lab-x1-carbon', {
      state: 'idle',
      trays: [{ slot: 0, type: 'PETG', color: '#fff' }],
    });

    expect(offeredTo(base, petg, scene)).toBe(false);
    expect(offeredTo(shell, petg, scene)).toBe(true);
    expect(offeredTo(base, fleet('core', 'prusa-core-one'), scene)).toBe(true);
  });

  it('moves a plate onto another printer’s bed, keeping its parts together', () => {
    const to = bedOf(printerModel('bambu-lab-a1-mini')!);
    const moved = plateOnBed(leg, bed, to)!;
    const before = plateFootprint(leg);
    const after = plateFootprint(moved);

    expect([after.w, after.d]).toEqual([before.w, before.d]);
    expect(after.x + after.w).toBeLessThanOrEqual(to.width);
    expect(after.y + after.d).toBeLessThanOrEqual(to.depth);
    expect(moved.items[0].matrix[12] - leg.items[0].matrix[12]).toBeCloseTo(
      to.origin[0] + after.x - bed.origin[0] - before.x,
      5,
    );
  });
});

describe('Start Next', () => {
  const printer = fleet('voron', 'bambu-lab-x1-carbon');

  it('picks the lowest plate that isn’t sent, printing or printed', () => {
    expect(nextPlate({ plates: plan.plates, records: [], printer, scene })).toBe(base);
    expect(nextPlate({ plates: plan.plates, records: sent([], base, 'printed'), printer, scene })).toBe(leg);
    expect(nextPlate({ plates: plan.plates, records: sent(sent([], base, 'printing'), leg), printer, scene })).toBe(
      shell,
    );
    expect(nextPlate({ plates: plan.plates, records: sent([], base, 'failed'), printer, scene })).toBe(base);
  });

  it('gives two idle printers pressed in turn different plates', () => {
    const other = fleet('trident', 'bambu-lab-p1s');
    const first = nextPlate({ plates: plan.plates, records: [], printer, scene })!;
    const second = nextPlate({ plates: plan.plates, records: sent([], first), printer: other, scene })!;

    expect(first).toBe(base);
    expect(second).toBe(leg);
  });

  it('has nothing for a printer once every plate it can take is out', () => {
    const records = plan.plates.reduce<PrintRecord[]>((all, p) => sent(all, p, 'printed'), []);

    expect(nextPlate({ plates: plan.plates, records, printer, scene })).toBeNull();
  });
});
