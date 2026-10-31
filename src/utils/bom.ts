import { BLOCKOUT_ONLY } from '../data/catalog';
import { COMPONENT_BY_ID, componentVariant } from '../data/components';
import { HardwareSpec, hardwareName, hardwareShopUrl, isStockLength, makeSpec, screwStandard } from '../data/hardware';
import { FILAMENT_SUPPLY, MATERIAL_DENSITY, SUPPLY_BY_ID } from '../data/supplies';
import { listPriceFor } from '../data/listPrices';
import type { MeshMeasure } from '../three/meshMeasure';
import type { PrintMaterial, ProjectSettings, PurchaseRecord, ScenePart } from '../types/robotics';
import {
  BOM_CATEGORIES,
  Bom,
  BomCategory,
  BomLine,
  FILAMENT_MARGIN,
  PrintedPart,
  PriceStatus,
  STALE_DAYS,
} from './bomTypes';

export { FILAMENT_MARGIN, STALE_DAYS, localDate } from './bomTypes';
export type { Bom, BomCategory, BomLine, PriceStatus, PrintedPart } from './bomTypes';
export { bomText, bomToCsv, bomToMarkdown } from './bomFormat';

const SHELL_MM = 0.9;

const BLOCKOUT_KINDS = new Set(BLOCKOUT_ONLY.map((b) => b.kind));
const NOT_PRINTED = new Set([
  'component',
  'hardware',
  'mesh',
  'image_plane',
  'hole_cylinder',
  'hole_box',
  'pivot_axis',
]);

export function hardwareKey(spec: HardwareSpec): string {
  const s = makeSpec(spec.type, { size: spec.size, length: spec.length, finish: spec.finish, drive: spec.drive });

  return `hardware:${s.type}|${s.size}|${s.length ?? ''}|${s.finish ?? ''}${s.drive ? `|${s.drive}` : ''}`;
}

export function specFromHardwareKey(key: string): HardwareSpec | null {
  if (!key.startsWith('hardware:')) return null;

  const [type, size, length, finish, drive] = key.slice('hardware:'.length).split('|');

  try {
    return makeSpec(type as HardwareSpec['type'], {
      size: size || undefined,
      length: length ? Number(length) : undefined,
      finish: (finish || undefined) as HardwareSpec['finish'],
      drive: (drive || undefined) as HardwareSpec['drive'],
    });
  } catch {
    return null;
  }
}

const MADE_ELSEWHERE: Record<string, string> = {
  'CNC Aluminum': 'CNC aluminum',
  'Laser-Cut Acrylic/Carbon': 'Laser-cut sheet',
  'Off-the-shelf COTS': 'Bought part, not from the catalog',
};

export function isPrinted(p: ScenePart): boolean {
  return (
    p.role === 'solid' &&
    !NOT_PRINTED.has(p.kind) &&
    !BLOCKOUT_KINDS.has(p.kind) &&
    !(p.mechanicalTag && MADE_ELSEWHERE[p.mechanicalTag])
  );
}

export const printMaterialOf = (p: ScenePart, project: ProjectSettings): PrintMaterial =>
  p.printMaterial ?? (p.mechanicalTag === 'TPU Flexible' ? 'TPU' : project.material);

export const isStandIn = (p: ScenePart): boolean => p.role === 'solid' && BLOCKOUT_KINDS.has(p.kind);

export function filamentGrams(
  m: Pick<MeshMeasure, 'volumeMm3' | 'areaMm2'>,
  material: PrintMaterial,
  infillPct: number,
): number {
  const shell = Math.min(m.volumeMm3, m.areaMm2 * SHELL_MM);
  const solid = shell + Math.max(0, m.volumeMm3 - shell) * (infillPct / 100);

  return (solid / 1000) * MATERIAL_DENSITY[material];
}

export function parseAsin(url: string): string | null {
  const m = url.match(/amazon\.com\/(?:[^?#]*\/)?(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?=[/?#]|$)/i);

  return m ? m[1].toUpperCase() : null;
}

const daysSince = (iso: string, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000));

interface LineInfo {
  category: BomCategory;
  name: string;
  detail: string;
  url?: string;
  urlKind: BomLine['urlKind'];
  warning?: string;
}

function describeComponent(key: string): LineInfo | null {
  const [id, variant] = key.slice('component:'.length).split('|');
  const c = COMPONENT_BY_ID[id];

  if (!c) return null;

  const v = componentVariant(c, variant);

  if (variant && !v) return null;

  const link = v ? (v.amazon ?? c.links.amazon) : c.links.amazon;

  return {
    category: 'Components',
    name: v ? `${c.name} ${v.label}` : c.name,
    detail: `${c.manufacturer} ${v ? v.mpn : c.mpn}`,
    url: link?.url,
    urlKind: link?.kind ?? 'none',
    warning: !v && c.variants?.length ? `Choose a version: ${c.variants.map((x) => x.label).join(', ')}` : undefined,
  };
}

function describeHardware(key: string): LineInfo | null {
  const spec = specFromHardwareKey(key);

  if (!spec) return null;

  const std = /screw|bolt/.test(spec.type) || spec.type.endsWith('_head') ? screwStandard(spec) : '';

  return {
    category: 'Hardware',
    name: hardwareName(spec),
    detail: std,
    url: hardwareShopUrl(spec),
    urlKind: 'search',
    warning: spec.length !== undefined && !isStockLength(spec) ? `${spec.length} mm isn't a stock length` : undefined,
  };
}

function describeSupply(key: string): LineInfo | null {
  const s = SUPPLY_BY_ID[key.slice('supply:'.length)];

  if (!s) return null;

  return {
    category: s.group === 'Filament' ? 'Filament' : 'Supplies',
    name: s.name,
    detail: s.spec,
    url: s.search,
    urlKind: 'search',
  };
}

const DESCRIBERS: Array<[string, (key: string) => LineInfo | null]> = [
  ['component:', describeComponent],
  ['hardware:', describeHardware],
  ['supply:', describeSupply],
];

export function describeKey(key: string): LineInfo | null {
  const describe = DESCRIBERS.find(([prefix]) => key.startsWith(prefix))?.[1];

  return describe ? describe(key) : null;
}

type Counts = Map<string, { qty: number; partIds: string[] }>;

function addCount(counts: Counts, key: string, qty: number, partIds: string[] = []) {
  const e = counts.get(key) ?? { qty: 0, partIds: [] };

  e.qty += qty;
  e.partIds.push(...partIds);
  counts.set(key, e);
}

function boughtKey(p: ScenePart): string | null {
  if ((p.kind === 'component' || p.kind === 'mesh') && p.componentId)
    return `component:${p.componentId}${p.componentVariant ? `|${p.componentVariant}` : ''}`;

  if (p.supplyId && SUPPLY_BY_ID[p.supplyId]) return `supply:${p.supplyId}`;

  return p.kind === 'hardware' && p.hardware ? hardwareKey(p.hardware) : null;
}

const madeElsewhereProcess = (p: ScenePart): string | undefined =>
  p.mechanicalTag && !NOT_PRINTED.has(p.kind) ? MADE_ELSEWHERE[p.mechanicalTag] : undefined;

function printedPart(p: ScenePart, m: MeshMeasure, project: ProjectSettings): PrintedPart {
  const material = printMaterialOf(p, project);

  return {
    id: p.id,
    name: p.name,
    material,
    volumeMm3: m.volumeMm3,
    areaMm2: m.areaMm2,
    grams: filamentGrams(m, material, project.infillPct),
    size: [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]],
  };
}

type PartTally = Pick<Bom, 'printed' | 'standIns' | 'unmeasured' | 'madeElsewhere' | 'filamentG'> & { counts: Counts };

function tallyPart(t: PartTally, p: ScenePart, project: ProjectSettings, m: MeshMeasure | undefined) {
  const key = boughtKey(p);

  if (key) return addCount(t.counts, key, 1, [p.id].filter(Boolean));

  if (isStandIn(p)) return t.standIns.push({ id: p.id, name: p.name });

  const process = madeElsewhereProcess(p);

  if (process) return t.madeElsewhere.push({ id: p.id, name: p.name, process });

  if (!isPrinted(p)) return;

  if (!m || m.volumeMm3 <= 0) return t.unmeasured.push(p.id);

  const printed = printedPart(p, m, project);

  t.printed.push(printed);
  t.filamentG[printed.material] = (t.filamentG[printed.material] ?? 0) + printed.grams;
}

function tallyParts(
  parts: ScenePart[],
  project: ProjectSettings,
  measures: Record<string, MeshMeasure | undefined>,
): PartTally {
  const t: PartTally = {
    counts: new Map(),
    printed: [],
    standIns: [],
    unmeasured: [],
    madeElsewhere: [],
    filamentG: {},
  };

  for (const p of parts) if (p.role === 'solid') tallyPart(t, p, project, measures[p.id]);

  return t;
}

function addFilament(t: PartTally, supportG: Partial<Record<PrintMaterial, number>>) {
  for (const [material, grams] of Object.entries(t.filamentG) as Array<[PrintMaterial, number]>) {
    addCount(
      t.counts,
      `supply:${FILAMENT_SUPPLY[material]}`,
      Math.ceil((grams + (supportG[material] ?? 0)) * (1 + FILAMENT_MARGIN)),
      t.printed.filter((x) => x.material === material).map((x) => x.id),
    );
  }
}

const cents = (v: number) => Math.round(v * 100) / 100;

function priceStatus(record: PurchaseRecord | undefined, ageDays: number | undefined): PriceStatus {
  if (!record) return 'unchecked';

  return ageDays! > STALE_DAYS ? 'stale' : 'checked';
}

interface LineContext {
  purchases: Record<string, PurchaseRecord>;
  now: Date;
}

function linePricing(key: string, qty: number, record: PurchaseRecord | undefined, filament: boolean) {
  const estimate = record ? undefined : listPriceFor(key);
  const packQty = record?.packQty ?? estimate?.per ?? (filament ? 1000 : undefined);
  const packs = packQty ? Math.max(1, Math.ceil(qty / packQty)) : undefined;

  return {
    packs,
    lineUsd: record && packs ? cents(packs * record.priceUsd) : undefined,
    estimate,
    estUsd: estimate && packs ? cents(packs * estimate.usd) : undefined,
  };
}

function bomLine(key: string, qty: number, partIds: string[], { purchases, now }: LineContext): BomLine | null {
  const info = describeKey(key);

  if (!info) return null;

  const record = purchases[key];
  const ageDays = record ? daysSince(record.checkedAt, now) : undefined;
  const filament = info.category === 'Filament';

  return {
    key,
    ...info,
    qty,
    unit: filament ? 'g' : 'pcs',
    partIds,
    url: record?.url || info.url,
    urlKind: record?.url ? 'product' : info.urlKind,
    record,
    status: priceStatus(record, ageDays),
    ageDays,
    ...linePricing(key, qty, record, filament),
  };
}

function bomTotals(lines: BomLine[], project: ProjectSettings): Bom['totals'] {
  const sum = (ls: BomLine[]) => cents(ls.reduce((s, l) => s + (l.lineUsd ?? 0), 0));
  const withStatus = (status: PriceStatus) => lines.filter((l) => l.status === status);
  const checkedUsd = sum(withStatus('checked'));
  const pricedUsd = sum(lines.filter((l) => l.status !== 'unchecked'));
  const unchecked = withStatus('unchecked');
  const estimatedUsd = cents(pricedUsd + unchecked.reduce((s, l) => s + (l.estUsd ?? 0), 0));

  return {
    checkedUsd,
    pricedUsd,
    checked: withStatus('checked').length,
    stale: withStatus('stale').length,
    unchecked: unchecked.length,
    estimatedUsd,
    unpriced: unchecked.filter((l) => l.estUsd === undefined).length,
    budgetUsd: project.budgetUsd,
    budgetEntered: project.budgetEntered,
    overBudget: project.budgetUsd !== undefined && estimatedUsd > project.budgetUsd,
  };
}

export interface BomInput {
  parts: ScenePart[];
  project: ProjectSettings;
  purchases: Record<string, PurchaseRecord>;
  measures: Record<string, MeshMeasure | undefined>;
  now?: Date;
  supportG?: Partial<Record<PrintMaterial, number>>;
}

export function buildBom({ parts, project, purchases, measures, now = new Date(), supportG = {} }: BomInput): Bom {
  const tally = tallyParts(parts, project, measures);

  addFilament(tally, supportG);

  for (const x of project.extras ?? []) if (x.qty > 0) addCount(tally.counts, x.key, x.qty);

  const lines = [...tally.counts]
    .map(([key, { qty, partIds }]) => bomLine(key, qty, partIds, { purchases, now }))
    .filter((l): l is BomLine => l !== null)
    .sort(
      (a, b) =>
        BOM_CATEGORIES.indexOf(a.category) - BOM_CATEGORIES.indexOf(b.category) ||
        b.qty - a.qty ||
        a.name.localeCompare(b.name),
    );

  return {
    lines,
    printed: tally.printed.sort((a, b) => b.grams - a.grams),
    standIns: tally.standIns,
    unmeasured: tally.unmeasured,
    madeElsewhere: tally.madeElsewhere,
    filamentG: tally.filamentG,
    totals: bomTotals(lines, project),
  };
}
