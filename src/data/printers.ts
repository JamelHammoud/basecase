import type { PrintMaterial } from '../types/robotics';
import { PRINTER_MODELS } from './printerCatalog';

export type Point2 = [number, number];

export interface PrinterPresets {
  machine: string;
  process: string | null;
  processes: Array<{ name: string; layer: number }>;
  filaments: Partial<Record<PrintMaterial, { name: string; density?: number }>>;
}

export interface PrinterModel {
  id: string;
  maker: string;
  name: string;
  bed: Point2[];
  height: number;
  keepOut: Point2[][];
  nozzles: number[];
  enclosed: boolean;
  bedType: string | null;
  vendor: string;
  presets: PrinterPresets | null;
}

export type ConnectionKind = 'bambu-studio' | 'bambu-connect' | 'bambu-lan' | 'moonraker' | 'prusalink' | 'octoprint';

export interface PrinterConnection {
  kind: ConnectionKind;
  host?: string;
  serial?: string;
}

export interface MyPrinter {
  id: string;
  modelId: string;
  nickname: string;
  nozzle: number;
  connection?: PrinterConnection;
  custom?: { width: number; depth: number; height: number };
  isDefault?: boolean;
}

export interface PrinterSetup {
  id: string;
  label: string;
  model: PrinterModel;
  nozzle: number;
  mine: MyPrinter | null;
}

export const FALLBACK_MODEL_ID = 'bambu-lab-p1s';
export const LEGACY_PRINTER_IDS: Record<string, string> = { 'bambu-p1s': FALLBACK_MODEL_ID };
export const DEFAULT_PRINTER = 'default';

export const CONNECTION_LABELS: Record<ConnectionKind, string> = {
  'bambu-studio': 'Bambu Studio',
  'bambu-connect': 'Bambu Connect',
  'bambu-lan': 'Bambu LAN (Developer Mode)',
  moonraker: 'Klipper (Moonraker)',
  prusalink: 'PrusaLink',
  octoprint: 'OctoPrint',
};

const byId = new Map(PRINTER_MODELS.map((m) => [m.id, m]));

export const printerModel = (id: string): PrinterModel | undefined => byId.get(id);

export function customModel(size: { width: number; depth: number; height: number }): PrinterModel {
  return {
    id: 'custom',
    maker: 'Custom',
    name: 'Custom printer',
    bed: [
      [0, 0],
      [size.width, 0],
      [size.width, size.depth],
      [0, size.depth],
    ],
    height: size.height,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'custom',
    presets: null,
  };
}

const fallbackModel = () => byId.get(FALLBACK_MODEL_ID) ?? PRINTER_MODELS[0];

export function modelOf(mine: MyPrinter): PrinterModel {
  if (mine.custom) return { ...customModel(mine.custom), name: mine.nickname };

  return byId.get(mine.modelId) ?? fallbackModel();
}

const setupOf = (mine: MyPrinter): PrinterSetup => ({
  id: mine.id,
  label: mine.nickname,
  model: modelOf(mine),
  nozzle: mine.nozzle,
  mine,
});

export const defaultPrinter = (mine: MyPrinter[]): MyPrinter | undefined => mine.find((p) => p.isDefault) ?? mine[0];

export function resolvePrinter(id: string | undefined, mine: MyPrinter[]): PrinterSetup {
  const own = mine.find((p) => p.id === id);

  if (own) return setupOf(own);

  const catalogId = id && (LEGACY_PRINTER_IDS[id] ?? id);
  const model = catalogId && catalogId !== DEFAULT_PRINTER ? byId.get(catalogId) : undefined;

  if (model) return { id: model.id, label: model.name, model, nozzle: 0.4, mine: null };

  const fallback = defaultPrinter(mine);

  if (fallback) return setupOf(fallback);

  const model0 = fallbackModel();

  return { id: model0.id, label: model0.name, model: model0, nozzle: 0.4, mine: null };
}

export const shortName = (model: PrinterModel): string =>
  model.maker && model.name.startsWith(model.maker) ? model.name.slice(model.maker.length).trim() : model.name;

export function printerMakers(): Array<{ maker: string; models: PrinterModel[] }> {
  const groups = new Map<string, PrinterModel[]>();

  for (const m of PRINTER_MODELS) groups.set(m.maker, [...(groups.get(m.maker) ?? []), m]);

  return [...groups.entries()].map(([maker, models]) => ({ maker, models }));
}

export { PRINTER_MODELS };
