import type { PrinterSetup } from '../data/printers';
import { bedOf, fitOnBed, type Bed, type Rect } from './bed';
import type { Plate, PlanItem } from './plan';
import type { PrinterStatus } from './printBridge';
import type { PlateStatusLookup } from './tracker';

export interface FleetPrinter {
  setup: PrinterSetup;
  status: PrinterStatus | null;
}

const BUSY = new Set(['sent', 'printing', 'printed']);

export function plateFootprint(plate: Plate): Rect & { h: number } {
  let x = Infinity;
  let y = Infinity;
  let right = -Infinity;
  let back = -Infinity;
  let h = -Infinity;

  for (const item of plate.items) {
    const yaw = item.yaw;
    const angle = (yaw * Math.PI) / 180;
    const diagonal = yaw % 90 !== 0;
    const c = diagonal ? Math.abs(Math.cos(angle)) : 0;
    const s = diagonal ? Math.abs(Math.sin(angle)) : 0;
    const w = diagonal ? c * item.w + s * item.d : item.w;
    const d = diagonal ? s * item.w + c * item.d : item.d;
    const left = item.x + (item.w - w) / 2;
    const front = item.y + (item.d - d) / 2;

    x = Math.min(x, left);
    y = Math.min(y, front);
    right = Math.max(right, left + w);
    back = Math.max(back, front + d);
    h = Math.max(h, item.h);
  }

  return { x, y, w: right - x, d: back - y, h };
}

function footprintSpot(size: ReturnType<typeof plateFootprint>, bed: Bed): Rect | null {
  const fit = fitOnBed(size.w, size.d, size.h, bed);

  return fit?.yaw === 0 ? fit.spot : null;
}

export const spotOn = (plate: Plate, bed: Bed): Rect | null => footprintSpot(plateFootprint(plate), bed);

export const reportedFilaments = (status: PrinterStatus | null) =>
  (status?.trays ?? []).map((t) => t.type.toUpperCase());

export function takesMaterial(plate: Plate, status: PrinterStatus | null): boolean {
  const loaded = reportedFilaments(status);

  return !loaded.length || loaded.some((type) => type.startsWith(plate.material));
}

const bedKey = (setup: PrinterSetup) =>
  JSON.stringify([
    setup.model.id,
    setup.model.bed,
    setup.model.height,
    setup.model.keepOut,
    setup.model.obstacles,
    setup.model.toolheadClearance,
    setup.model.brimClearance,
    setup.model.obstacleUnsupported,
  ]);

export const sameMachine = (a: PrinterSetup, b: PrinterSetup) => bedKey(a) === bedKey(b) && a.nozzle === b.nozzle;

const holds = (plate: Plate, printer: FleetPrinter, scene: PrinterSetup, process?: string) =>
  bedKey(printer.setup) === bedKey(scene) || !!spotOn(plate, bedOf(printer.setup.model, process));

export const offeredTo = (plate: Plate, printer: FleetPrinter, scene: PrinterSetup, process?: string) =>
  takesMaterial(plate, printer.status) && holds(plate, printer, scene, process);

export const isIdle = (printer: FleetPrinter) => printer.status?.state === 'idle';

interface NextPlate {
  plates: Plate[];
  plateStatus: PlateStatusLookup;
  printer: FleetPrinter;
  scene: PrinterSetup;
  process?: string;
}

export function nextPlate({ plates, plateStatus, printer, scene, process }: NextPlate): Plate | null {
  const open = plates.filter((p) => !BUSY.has(plateStatus(p).state) && offeredTo(p, printer, scene, process));

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
  const at = plateFootprint(plate);
  const spot = footprintSpot(at, to);

  if (!spot) return null;

  const bed: Shift['bed'] = [spot.x - at.x, spot.y - at.y];
  const world: Shift['world'] = [to.origin[0] - from.origin[0] + bed[0], to.origin[1] - from.origin[1] + bed[1]];

  return { ...plate, local: 1, items: plate.items.map((it) => moved(it, { bed, world })) };
}
