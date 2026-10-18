/**
 * Bill of materials, built from the scene and never from agent text: catalog components are
 * counted by part, hardware by exact spec, printed parts become filament grams per material,
 * and the project's purchase-only extras (battery, wiring…) are added by catalog key.
 *
 * Prices come only from purchase records the user made (library/purchases.json): what they saw
 * on a listing, with a date. Lines without a record are "Not checked" and never count toward
 * the checked total.
 */
import { BLOCKOUT_ONLY } from '../data/catalog';
import { COMPONENT_BY_ID, componentVariant } from '../data/components';
import { HardwareSpec, hardwareName, hardwareShopUrl, isStockLength, makeSpec, screwStandard } from '../data/hardware';
import { FILAMENT_SUPPLY, MATERIAL_DENSITY, SUPPLY_BY_ID } from '../data/supplies';
import { ListPrice, listPriceFor } from '../data/listPrices';
import type { MeshMeasure } from '../three/meshMeasure';
import type { PrintMaterial, ProjectSettings, PurchaseRecord, ScenePart } from '../types/robotics';

/** A check older than this is Stale: prices and listings drift */
export const STALE_DAYS = 60;
/** Filament margin for purge, brims and a failed print */
export const FILAMENT_MARGIN = 0.15;
/** Perimeters + top/bottom shells as one shell thickness (2 walls × 0.42 mm, 4 × 0.2 mm layers) */
const SHELL_MM = 0.9;

export type BomCategory = 'Components' | 'Hardware' | 'Supplies' | 'Filament';
export type PriceStatus = 'checked' | 'stale' | 'unchecked';

export interface BomLine {
  /** Catalog key: component:<id>, hardware:<type>|<size>|<length>|<finish>[|<drive>], supply:<id> */
  key: string;
  category: BomCategory;
  name: string;
  /** Maker · part number, or the spec to look for */
  detail: string;
  /** Pieces needed (grams for filament) */
  qty: number;
  unit: 'pcs' | 'g';
  /** Scene parts this line covers */
  partIds: string[];
  /** The checked listing when there is one, else the catalog link */
  url?: string;
  urlKind: 'product' | 'search' | 'none';
  record?: PurchaseRecord;
  status: PriceStatus;
  /** Days since the check */
  ageDays?: number;
  /** Listings to buy (needs the record's pack size; filament assumes 1 kg spools) */
  packs?: number;
  lineUsd?: number;
  /** Unchecked lines: a list price from a maker or distributor store, for the budget only */
  estimate?: ListPrice;
  /** Packs × list price, when there's an estimate and no check */
  estUsd?: number;
  /** Warnings that matter when ordering, e.g. a non-stock screw length */
  warning?: string;
}

export interface PrintedPart {
  id: string;
  name: string;
  material: PrintMaterial;
  volumeMm3: number;
  areaMm2: number;
  /** Estimated part filament (no supports) */
  grams: number;
  /** World size (x, y, z) mm */
  size: [number, number, number];
}

export interface Bom {
  lines: BomLine[];
  printed: PrintedPart[];
  /** Estimated stand-ins (generic servo, board…) that must become catalog parts before buying */
  standIns: Array<{ id: string; name: string }>;
  /** Printed parts whose mesh wasn't ready to measure */
  unmeasured: string[];
  /** Parts that need a source other than a listing: CNC, laser-cut, or bought parts modeled by hand */
  madeElsewhere: Array<{ id: string; name: string; process: string }>;
  filamentG: Partial<Record<PrintMaterial, number>>;
  totals: {
    /** Checked lines only */
    checkedUsd: number;
    /** Checked + stale */
    pricedUsd: number;
    checked: number;
    stale: number;
    unchecked: number;
    /** Priced lines plus list-price estimates for the unchecked ones */
    estimatedUsd: number;
    /** Unchecked lines with no list price either */
    unpriced: number;
    budgetUsd?: number;
    /** Priced total over budget */
    overBudget: boolean;
  };
}

const BLOCKOUT_KINDS = new Set(BLOCKOUT_ONLY.map((b) => b.kind));
const NOT_PRINTED = new Set(['component', 'hardware', 'mesh', 'image_plane', 'hole_cylinder', 'hole_box', 'pivot_axis']);

/** Normalized key for an exact hardware spec (default finish and drive spelled out) */
export function hardwareKey(spec: HardwareSpec): string {
  const s = makeSpec(spec.type, spec.size, spec.length, spec.finish, spec.drive);
  return `hardware:${s.type}|${s.size}|${s.length ?? ''}|${s.finish ?? ''}${s.drive ? `|${s.drive}` : ''}`;
}

export function specFromHardwareKey(key: string): HardwareSpec | null {
  if (!key.startsWith('hardware:')) return null;
  const [type, size, length, finish, drive] = key.slice('hardware:'.length).split('|');
  try {
    return makeSpec(
      type as HardwareSpec['type'],
      size || undefined,
      length ? Number(length) : undefined,
      (finish || undefined) as HardwareSpec['finish'],
      (drive || undefined) as HardwareSpec['drive']
    );
  } catch {
    return null;
  }
}

/** Material tags (Inspector → Appearance) for parts made some other way than printing */
const MADE_ELSEWHERE: Record<string, string> = {
  'CNC Aluminum': 'CNC aluminum',
  'Laser-Cut Acrylic/Carbon': 'Laser-cut sheet',
  // A bought part the agent modeled itself (not from the catalog), so there's no listing for it
  'Off-the-shelf COTS': 'Bought part, not from the catalog',
};

/** Is this part printed on the P1S? */
export function isPrinted(p: ScenePart): boolean {
  return (
    p.role === 'solid' &&
    !NOT_PRINTED.has(p.kind) &&
    !BLOCKOUT_KINDS.has(p.kind) &&
    !(p.mechanicalTag && MADE_ELSEWHERE[p.mechanicalTag])
  );
}

/** The filament a printed part uses: its own setting, TPU when tagged flexible, else the project's */
export const printMaterialOf = (p: ScenePart, project: ProjectSettings): PrintMaterial =>
  p.printMaterial ?? (p.mechanicalTag === 'TPU Flexible' ? 'TPU' : project.material);

export const isStandIn = (p: ScenePart): boolean => p.role === 'solid' && BLOCKOUT_KINDS.has(p.kind);

/** Filament for one part: shell at full density, the interior at the infill fraction */
export function filamentGrams(m: Pick<MeshMeasure, 'volumeMm3' | 'areaMm2'>, material: PrintMaterial, infillPct: number): number {
  const shell = Math.min(m.volumeMm3, m.areaMm2 * SHELL_MM);
  const solid = shell + Math.max(0, m.volumeMm3 - shell) * (infillPct / 100);
  return (solid / 1000) * MATERIAL_DENSITY[material];
}

/** Today (or `d`) as YYYY-MM-DD in local time: a check made this evening is dated today, not tomorrow's UTC date */
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Pulls the ASIN out of an Amazon product URL (/dp/…, /gp/product/…, /gp/aw/d/…) */
export function parseAsin(url: string): string | null {
  const m = url.match(/amazon\.com\/(?:[^?#]*\/)?(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?=[/?#]|$)/i);
  return m ? m[1].toUpperCase() : null;
}

const daysSince = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000));

interface LineInfo {
  category: BomCategory;
  name: string;
  detail: string;
  url?: string;
  urlKind: BomLine['urlKind'];
  warning?: string;
}

/** Name, detail and catalog link for a key; null for an unknown key */
export function describeKey(key: string): LineInfo | null {
  if (key.startsWith('component:')) {
    const [id, variant] = key.slice('component:'.length).split('|');
    const c = COMPONENT_BY_ID[id];
    if (!c) return null;
    const v = componentVariant(c, variant);
    if (variant && !v) return null;
    const link = v ? v.amazon ?? c.links.amazon : c.links.amazon;
    return {
      category: 'Components',
      name: v ? `${c.name} ${v.label}` : c.name,
      detail: `${c.manufacturer} · ${v ? v.mpn : c.mpn}`,
      url: link?.url,
      urlKind: link?.kind ?? 'none',
      warning: !v && c.variants?.length ? `Choose a version: ${c.variants.map((x) => x.label).join(', ')}` : undefined,
    };
  }
  if (key.startsWith('hardware:')) {
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
  if (key.startsWith('supply:')) {
    const s = SUPPLY_BY_ID[key.slice('supply:'.length)];
    if (!s) return null;
    return { category: s.group === 'Filament' ? 'Filament' : 'Supplies', name: s.name, detail: s.spec, url: s.search, urlKind: 'search' };
  }
  return null;
}

export function buildBom(
  parts: ScenePart[],
  project: ProjectSettings,
  purchases: Record<string, PurchaseRecord>,
  measures: Record<string, MeshMeasure | undefined>,
  now = new Date(),
  /** Support filament per material, from the print report */
  supportG: Partial<Record<PrintMaterial, number>> = {}
): Bom {
  const counts = new Map<string, { qty: number; partIds: string[] }>();
  const add = (key: string, qty: number, partId?: string) => {
    const e = counts.get(key) ?? { qty: 0, partIds: [] };
    e.qty += qty;
    if (partId) e.partIds.push(partId);
    counts.set(key, e);
  };

  const printed: PrintedPart[] = [];
  const standIns: Bom['standIns'] = [];
  const unmeasured: string[] = [];
  const madeElsewhere: Bom['madeElsewhere'] = [];
  const filamentG: Bom['filamentG'] = {};

  for (const p of parts) {
    if (p.role !== 'solid') continue;
    if (p.kind === 'component' && p.componentId) add(`component:${p.componentId}${p.componentVariant ? `|${p.componentVariant}` : ''}`, 1, p.id);
    else if (p.supplyId && SUPPLY_BY_ID[p.supplyId]) add(`supply:${p.supplyId}`, 1, p.id);
    else if (p.kind === 'hardware' && p.hardware) add(hardwareKey(p.hardware), 1, p.id);
    else if (isStandIn(p)) standIns.push({ id: p.id, name: p.name });
    else if (p.mechanicalTag && MADE_ELSEWHERE[p.mechanicalTag] && !NOT_PRINTED.has(p.kind))
      madeElsewhere.push({ id: p.id, name: p.name, process: MADE_ELSEWHERE[p.mechanicalTag] });
    else if (isPrinted(p)) {
      const m = measures[p.id];
      if (!m || m.volumeMm3 <= 0) {
        unmeasured.push(p.id);
        continue;
      }
      const material = printMaterialOf(p, project);
      const grams = filamentGrams(m, material, project.infillPct);
      printed.push({
        id: p.id,
        name: p.name,
        material,
        volumeMm3: m.volumeMm3,
        areaMm2: m.areaMm2,
        grams,
        size: [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]],
      });
      filamentG[material] = (filamentG[material] ?? 0) + grams;
    }
  }
  for (const [material, grams] of Object.entries(filamentG) as Array<[PrintMaterial, number]>) {
    const e = counts.get(`supply:${FILAMENT_SUPPLY[material]}`) ?? { qty: 0, partIds: [] };
    e.qty += Math.ceil((grams + (supportG[material] ?? 0)) * (1 + FILAMENT_MARGIN));
    e.partIds.push(...printed.filter((x) => x.material === material).map((x) => x.id));
    counts.set(`supply:${FILAMENT_SUPPLY[material]}`, e);
  }
  for (const x of project.extras ?? []) if (x.qty > 0) add(x.key, x.qty);

  const order: BomCategory[] = ['Components', 'Hardware', 'Supplies', 'Filament'];
  const lines: BomLine[] = [];
  for (const [key, { qty, partIds }] of counts) {
    const info = describeKey(key);
    if (!info) continue;
    const record = purchases[key];
    const ageDays = record ? daysSince(record.checkedAt, now) : undefined;
    const status: PriceStatus = !record ? 'unchecked' : ageDays! > STALE_DAYS ? 'stale' : 'checked';
    const filament = info.category === 'Filament';
    const estimate = record ? undefined : listPriceFor(key);
    const packQty = record?.packQty ?? estimate?.per ?? (filament ? 1000 : undefined);
    const packs = packQty ? Math.max(1, Math.ceil(qty / packQty)) : undefined;
    lines.push({
      key,
      ...info,
      qty,
      unit: filament ? 'g' : 'pcs',
      partIds,
      url: record?.url || info.url,
      urlKind: record?.url ? 'product' : info.urlKind,
      record,
      status,
      ageDays,
      packs,
      lineUsd: record && packs ? Math.round(packs * record.priceUsd * 100) / 100 : undefined,
      estimate,
      estUsd: estimate && packs ? Math.round(packs * estimate.usd * 100) / 100 : undefined,
    });
  }
  lines.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || b.qty - a.qty || a.name.localeCompare(b.name));

  const sum = (ls: BomLine[]) => Math.round(ls.reduce((s, l) => s + (l.lineUsd ?? 0), 0) * 100) / 100;
  const checkedUsd = sum(lines.filter((l) => l.status === 'checked'));
  const pricedUsd = sum(lines.filter((l) => l.status !== 'unchecked'));
  return {
    lines,
    printed: printed.sort((a, b) => b.grams - a.grams),
    standIns,
    unmeasured,
    madeElsewhere,
    filamentG,
    totals: {
      checkedUsd,
      pricedUsd,
      checked: lines.filter((l) => l.status === 'checked').length,
      stale: lines.filter((l) => l.status === 'stale').length,
      unchecked: lines.filter((l) => l.status === 'unchecked').length,
      estimatedUsd: Math.round((pricedUsd + lines.reduce((s, l) => s + (l.status === 'unchecked' ? l.estUsd ?? 0 : 0), 0)) * 100) / 100,
      unpriced: lines.filter((l) => l.status === 'unchecked' && l.estUsd === undefined).length,
      budgetUsd: project.budgetUsd,
      overBudget: project.budgetUsd !== undefined && pricedUsd > project.budgetUsd,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<PriceStatus, string> = { checked: 'Checked', stale: 'Stale', unchecked: 'Not checked' };
const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const usd = (n?: number) => (n === undefined ? '' : n.toFixed(2));

/** One row per line: what to buy, how many listings, the recorded price and where it came from */
export function bomToCsv(bom: Bom, partNames: Record<string, string>): string {
  const head = [
    'Item', 'Category', 'Maker / Spec', 'Qty Needed', 'Unit', 'Pack Qty', 'Packs to Buy', 'Pack Price (USD)', 'Line Total (USD)',
    'Link', 'Link Type', 'ASIN', 'Listing Title', 'Price Checked', 'Price Status', 'Estimate (USD)', 'Estimate Source', 'Estimate Seen',
    'Note', 'Used By',
  ];
  const rows = bom.lines.map((l) => [
    l.name, l.category, l.detail, l.qty, l.unit, l.record?.packQty ?? (l.category === 'Filament' ? 1000 : ''), l.packs ?? '',
    usd(l.record?.priceUsd), usd(l.lineUsd), l.url ?? '', l.urlKind === 'product' ? 'Listing' : l.urlKind === 'search' ? 'Search' : '',
    l.record?.asin ?? '', l.record?.title ?? '', l.record?.checkedAt ?? '', STATUS_LABEL[l.status],
    usd(l.estUsd), l.estimate ? `${l.estimate.store} ${l.estimate.url}` : '', l.estimate?.seen ?? '',
    [l.warning, l.record?.note].filter(Boolean).join('; '),
    [...new Set(l.partIds.map((id) => partNames[id] ?? id))].slice(0, 12).join('; '),
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

export function bomToMarkdown(bom: Bom, sceneName: string, today = new Date()): string {
  const t = bom.totals;
  const out: string[] = [`# ${sceneName}: bill of materials`, '', `Generated ${localDate(today)} from the scene. Prices are what was seen on each listing on its check date; Amazon prices change, so recheck before ordering.`, ''];
  out.push(`- **Checked total:** $${t.checkedUsd.toFixed(2)} (${t.checked} lines)`);
  if (t.stale) out.push(`- **Stale checks** (over ${STALE_DAYS} days): ${t.stale} lines, $${(t.pricedUsd - t.checkedUsd).toFixed(2)}`);
  if (t.unchecked) out.push(`- **Not checked:** ${t.unchecked} lines, not in the checked total`);
  out.push(`- **Estimated total:** ~$${t.estimatedUsd.toFixed(2)}, using maker and distributor list prices (marked ~) for unchecked lines${t.unpriced ? `; ${t.unpriced} lines have no price` : ''}`);
  if (t.budgetUsd !== undefined) out.push(`- **Budget:** $${t.budgetUsd.toFixed(2)}${t.overBudget ? ' (over budget)' : ''}`);
  out.push('');
  for (const cat of ['Components', 'Hardware', 'Supplies', 'Filament'] as BomCategory[]) {
    const ls = bom.lines.filter((l) => l.category === cat);
    if (!ls.length) continue;
    out.push(`## ${cat}`, '', '| Item | Qty | Packs | Price | Checked | Link |', '|---|---:|---:|---:|---|---|');
    for (const l of ls) {
      const qty = l.unit === 'g' ? `${l.qty} g` : String(l.qty);
      const link = l.url ? `[${l.urlKind === 'product' ? 'Listing' : 'Search'}](${l.url})` : '';
      const name = `${l.name}${l.detail ? ` <br>${l.detail}` : ''}${l.warning ? ` <br>⚠ ${l.warning}` : ''}`;
      const price = l.lineUsd !== undefined ? `$${l.lineUsd.toFixed(2)}` : l.estUsd !== undefined ? `~$${l.estUsd.toFixed(2)} ([list](${l.estimate!.url}))` : '';
      out.push(`| ${name} | ${qty} | ${l.packs ?? ''} | ${price} | ${l.record ? `${l.record.checkedAt}${l.status === 'stale' ? ' (stale)' : ''}` : 'Not checked'} | ${link} |`);
    }
    out.push('');
  }
  if (bom.printed.length) {
    out.push('## Printed parts', '', '| Part | Material | Size (mm) | Filament |', '|---|---|---|---:|');
    for (const p of bom.printed) out.push(`| ${p.name} | ${p.material} | ${p.size.map((v) => v.toFixed(0)).join(' × ')} | ${p.grams.toFixed(0)} g |`);
    out.push('', `Filament estimates assume 2 walls, 4 top/bottom layers and the project's infill; spools include estimated supports and a ${Math.round(FILAMENT_MARGIN * 100)}% margin for brims and reprints.`, '');
  }
  if (bom.madeElsewhere.length) out.push('## Needs a source', '', ...bom.madeElsewhere.map((m) => `- ${m.name}: ${m.process}`), '');
  if (bom.standIns.length) out.push('## Stand-ins to replace', '', ...bom.standIns.map((s) => `- ${s.name}: an estimated block-out, not a real part`), '');
  return out.join('\n');
}

/** The BOM as the agent reads it (get_bom): every line with its key, quantity and known price */
export function bomText(bom: Bom, names: Record<string, string>): string {
  const t = bom.totals;
  const out: string[] = [];
  const budget = t.budgetUsd !== undefined ? `Budget $${t.budgetUsd.toFixed(2)}` : 'No budget set';
  out.push(
    `${budget}. Checked prices total $${t.pricedUsd.toFixed(2)} (${t.checked} checked, ${t.stale} stale). With list-price estimates for the rest: ~$${t.estimatedUsd.toFixed(2)}${t.unpriced ? `, plus ${t.unpriced} lines with no price known` : ''}.` +
      (t.budgetUsd !== undefined && t.estimatedUsd > t.budgetUsd ? ' The estimate is OVER BUDGET.' : '')
  );
  out.push('Checked prices are the user\'s own Amazon listing checks; estimates are maker or distributor list prices. Never state or guess any other price.');
  for (const cat of ['Components', 'Hardware', 'Supplies', 'Filament'] as BomCategory[]) {
    const ls = bom.lines.filter((l) => l.category === cat);
    if (!ls.length) continue;
    out.push('', `${cat}:`);
    for (const l of ls) {
      const qty = l.unit === 'g' ? `${l.qty} g` : `${l.qty}×`;
      const price = l.record
        ? `$${l.record.priceUsd.toFixed(2)} per ${l.record.packQty}${l.unit === 'g' ? ' g' : ''}, ${l.packs} to buy = $${(l.lineUsd ?? 0).toFixed(2)} (checked ${l.record.checkedAt}${l.status === 'stale' ? ', stale' : ''})`
        : l.estimate
          ? `not checked; list price $${l.estimate.usd.toFixed(2)} per ${l.estimate.per} at ${l.estimate.store} (${l.estimate.seen}), ${l.packs} = ~$${(l.estUsd ?? 0).toFixed(2)}`
          : 'no price known';
      out.push(`- ${qty} ${l.name} [${l.key}] · ${price}${l.warning ? ` · ${l.warning}` : ''}`);
    }
  }
  if (bom.printed.length) {
    const fil = Object.entries(bom.filamentG).map(([m, g]) => `${m} ${Math.round(g ?? 0)} g`).join(', ');
    out.push('', `Printed: ${bom.printed.length} ${bom.printed.length === 1 ? 'part' : 'parts'}, ${fil} (estimate, no supports).`);
  }
  if (bom.standIns.length) out.push('', `Stand-ins (estimated block-outs; replace with catalog parts or model_part): ${bom.standIns.map((s) => s.id).join(', ')}`);
  if (bom.madeElsewhere.length)
    out.push('', `Need a source (no listing): ${bom.madeElsewhere.map((m) => `${m.id} (${m.process})`).join(', ')}. Prefer catalog parts or printed parts.`);
  if (bom.unmeasured.length) out.push('', `Not measured yet: ${bom.unmeasured.map((id) => names[id] ?? id).join(', ')}`);
  return out.join('\n');
}
