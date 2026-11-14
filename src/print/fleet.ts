import type { PrinterSetup } from '../data/printers';
import type { PrintRecord } from '../types/robotics';
import { bedOf, fitOnBed, type Bed, type Rect } from './bed';
import type { Plate, PlanItem } from './plan';
import type { PrinterStatus } from './printBridge';
import { plateStatus } from './tracker';

export interface FleetPrinter {
  setup: PrinterSetup;
  status: PrinterStatus | null;
}

const BUSY = new Set(['sent', 'printing', 'printed']);

export function plateFootprint(plate: Plate): Rect & { h: number } {
  const x = Math.min(...plate.items.map((it) => it.x));
  const y = Math.min(...plate.items.map((it) => it.y));

  return {
    x,
    y,
    w: Math.max(...plate.items.map((it) => it.x + it.w)) - x,
    d: Math.max(...plate.items.map((it) => it.y + it.d)) - y,
    h: Math.max(...plate.items.map((it) => it.h)),
  };
}

export function spotOn(plate: Plate, bed: Bed): Rect | null {
  const size = plateFootprint(plate);
  const fit = fitOnBed(size.w, size.d, size.h, bed);

  return fit?.yaw === 0 ? fit.spot : null;
}

export const reportedFilaments = (status: PrinterStatus | null) =>
  (status?.trays ?? []).map((t) => t.type.toUpperCase());

export function takesMaterial(plate: Plate, status: PrinterStatus | null): boolean {
  const loaded = reportedFilaments(status);

  return !loaded.length || loaded.some((type) => type.startsWith(plate.material));
}

const bedKey = (setup: PrinterSetup) =>
  JSON.stringify([setup.model.id, setup.model.bed, setup.model.height, setup.model.keepOut]);

export const sameMachine = (a: PrinterSetup, b: PrinterSetup) => bedKey(a) === bedKey(b) && a.nozzle === b.nozzle;

const holds = (plate: Plate, printer: FleetPrinter, scene: PrinterSetup) =>
  bedKey(printer.setup) === bedKey(scene) || !!spotOn(plate, bedOf(printer.setup.model));

export const offeredTo = (plate: Plate, printer: FleetPrinter, scene: PrinterSetup) =>
  takesMaterial(plate, printer.status) && holds(plate, printer, scene);

export const isIdle = (printer: FleetPrinter) => printer.status?.state === 'idle';

interface NextPlate {
  plates: Plate[];
  records: PrintRecord[];
  printer: FleetPrinter;
  scene: PrinterSetup;
}

export function nextPlate({ plates, records, printer, scene }: NextPlate): Plate | null {
  const open = plates.filter((p) => !BUSY.has(plateStatus(p, records).state) && offeredTo(p, printer, scene));

  return open.sort((a, b) => a.number - b.number)[0] ?? null;
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

interface Shift {
  bed: [number, number];
  world: [number, number];
}

function moved(item: PlanItem, shift: Shift): PlanItem {
  const matrix = [...item.matrix];

  matrix[12] = round(matrix[12] + shift.world[0]);
  matrix[13] = round(matrix[13] + shift.world[1]);

  return { ...item, x: item.x + shift.bed[0], y: item.y + shift.bed[1], matrix };
}

export function plateOnBed(plate: Plate, from: Bed, to: Bed): Plate | null {
  const spot = spotOn(plate, to);

  if (!spot) return null;

  const at = plateFootprint(plate);
  const bed: Shift['bed'] = [spot.x - at.x, spot.y - at.y];
  const world: Shift['world'] = [to.origin[0] - from.origin[0] + bed[0], to.origin[1] - from.origin[1] + bed[1]];

  return { ...plate, local: 1, items: plate.items.map((it) => moved(it, { bed, world })) };
}
