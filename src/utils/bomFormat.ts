import { BOM_CATEGORIES, Bom, BomLine, FILAMENT_MARGIN, PriceStatus, STALE_DAYS, localDate } from './bomTypes';
import { currencyNote, type Money, scaledEntry } from './currency';
import { currentMoney } from './currencyStore';

const STATUS_LABEL: Record<PriceStatus, string> = { checked: 'Checked', stale: 'Stale', unchecked: 'Not checked' };
const LINK_TYPE: Record<BomLine['urlKind'], string> = { product: 'Listing', search: 'Search', none: '' };
const csvHead = (code: string) => [
  'Item',
  'Category',
  'Maker / Spec',
  'Qty Needed',
  'Unit',
  'Pack Qty',
  'Packs to Buy',
  `Pack Price (${code})`,
  `Line Total (${code})`,
  'Link',
  'Link Type',
  'ASIN',
  'Listing Title',
  'Price Checked',
  'Price Status',
  `Estimate (${code})`,
  'Estimate Source',
  'Estimate Seen',
  'Note',
  'Used By',
];

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);

  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const byCategory = (bom: Bom) =>
  BOM_CATEGORIES.map((cat) => ({ cat, ls: bom.lines.filter((l) => l.category === cat) })).filter((g) => g.ls.length);

const recordCells = (l: BomLine) => [
  l.record?.asin ?? '',
  l.record?.title ?? '',
  l.record?.checkedAt ?? '',
  STATUS_LABEL[l.status],
];

const lineEntry = (l: BomLine) => scaledEntry(l.record?.entered, l.packs ?? 1);

const estimateCells = (l: BomLine, money: Money) => [
  l.estUsd === undefined ? '' : money.plain(l.estUsd),
  l.estimate ? `${l.estimate.store} ${l.estimate.url}` : '',
  l.estimate?.seen ?? '',
];

const csvRow = (l: BomLine, partNames: Record<string, string>, money: Money) => [
  l.name,
  l.category,
  l.detail,
  l.qty,
  l.unit,
  l.record?.packQty ?? (l.category === 'Filament' ? 1000 : ''),
  l.packs ?? '',
  l.record ? money.plain(l.record.priceUsd, l.record.entered) : '',
  l.lineUsd === undefined ? '' : money.plain(l.lineUsd, lineEntry(l)),
  l.url ?? '',
  LINK_TYPE[l.urlKind],
  ...recordCells(l),
  ...estimateCells(l, money),
  [l.warning, l.record?.note].filter(Boolean).join('; '),
  [...new Set(l.partIds.map((id) => partNames[id] ?? id))].slice(0, 12).join('; '),
];

export function bomToCsv(bom: Bom, partNames: Record<string, string>, money: Money = currentMoney()): string {
  const rows = bom.lines.map((l) => csvRow(l, partNames, money));

  return [csvHead(money.code), ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

function markdownTotals(t: Bom['totals'], money: Money): string[] {
  const out = [`- **Checked total:** ${money.format(t.checkedUsd)} (${t.checked} lines)`];

  if (t.stale)
    out.push(
      `- **Stale checks** (over ${STALE_DAYS} days): ${t.stale} lines, ${money.format(t.pricedUsd - t.checkedUsd)}`,
    );

  if (t.unchecked) out.push(`- **Not checked:** ${t.unchecked} lines, not in the checked total`);

  out.push(
    `- **Estimated total:** ~${money.format(t.estimatedUsd)}, using maker and distributor list prices (marked ~) for unchecked lines${t.unpriced ? `; ${t.unpriced} lines have no price` : ''}`,
  );

  if (t.budgetUsd !== undefined)
    out.push(`- **Budget:** ${money.format(t.budgetUsd, t.budgetEntered)}${t.overBudget ? ' (over budget)' : ''}`);

  return out;
}

function markdownPrice(l: BomLine, money: Money): string {
  if (l.lineUsd !== undefined) return money.format(l.lineUsd, lineEntry(l));

  return l.estUsd !== undefined ? `~${money.format(l.estUsd)} ([list](${l.estimate!.url}))` : '';
}

function markdownRow(l: BomLine, money: Money): string {
  const qty = l.unit === 'g' ? `${l.qty} g` : String(l.qty);
  const link = l.url ? `[${l.urlKind === 'product' ? 'Listing' : 'Search'}](${l.url})` : '';
  const name = `${l.name}${l.detail ? ` <br>${l.detail}` : ''}${l.warning ? ` <br>⚠ ${l.warning}` : ''}`;
  const checked = l.record ? `${l.record.checkedAt}${l.status === 'stale' ? ' (stale)' : ''}` : 'Not checked';

  return `| ${name} | ${qty} | ${l.packs ?? ''} | ${markdownPrice(l, money)} | ${checked} | ${link} |`;
}

function markdownPrinted(bom: Bom): string[] {
  if (!bom.printed.length) return [];

  return [
    '## Printed parts',
    '',
    '| Part | Material | Size (mm) | Filament |',
    '|---|---|---|---:|',
    ...bom.printed.map(
      (p) => `| ${p.name} | ${p.material} | ${p.size.map((v) => v.toFixed(0)).join(' × ')} | ${p.grams.toFixed(0)} g |`,
    ),
    '',
    `Filament estimates assume 2 walls, 4 top/bottom layers and the project's infill; spools include estimated supports and a ${Math.round(FILAMENT_MARGIN * 100)}% margin for brims and reprints.`,
    '',
  ];
}

export function bomToMarkdown(bom: Bom, sceneName: string, money: Money = currentMoney(), today = new Date()): string {
  const out: string[] = [
    `# ${sceneName}: bill of materials`,
    '',
    `Generated ${localDate(today)} from the scene. Prices are what was seen on each listing on its check date; Amazon prices change, so recheck before ordering.`,
    '',
    ...markdownTotals(bom.totals, money),
    '',
  ];

  for (const { cat, ls } of byCategory(bom))
    out.push(
      `## ${cat}`,
      '',
      '| Item | Qty | Packs | Price | Checked | Link |',
      '|---|---:|---:|---:|---|---|',
      ...ls.map((l) => markdownRow(l, money)),
      '',
    );

  out.push(...markdownPrinted(bom));

  if (bom.madeElsewhere.length)
    out.push('## Needs a source', '', ...bom.madeElsewhere.map((m) => `- ${m.name}: ${m.process}`), '');

  if (bom.standIns.length)
    out.push(
      '## Stand-ins to replace',
      '',
      ...bom.standIns.map((s) => `- ${s.name}: an estimated block-out, not a real part`),
      '',
    );

  return out.join('\n');
}

function textSummary(t: Bom['totals'], money: Money): string {
  const budget = t.budgetUsd !== undefined ? `Budget ${money.format(t.budgetUsd, t.budgetEntered)}` : 'No budget set';
  const over = t.budgetUsd !== undefined && t.estimatedUsd > t.budgetUsd ? ' The estimate is OVER BUDGET.' : '';

  return (
    `${budget}. Checked prices total ${money.format(t.pricedUsd)} (${t.checked} checked, ${t.stale} stale). With list-price estimates for the rest: ~${money.format(t.estimatedUsd)}${t.unpriced ? `, plus ${t.unpriced} lines with no price known` : ''}.` +
    over
  );
}

function textPrice(l: BomLine, money: Money): string {
  if (l.record)
    return `${money.format(l.record.priceUsd, l.record.entered)} per ${l.record.packQty}${l.unit === 'g' ? ' g' : ''}, ${l.packs} to buy = ${money.format(l.lineUsd ?? 0, lineEntry(l))} (checked ${l.record.checkedAt}${l.status === 'stale' ? ', stale' : ''})`;

  if (l.estimate)
    return `not checked; list price ${money.format(l.estimate.usd)} per ${l.estimate.per} at ${l.estimate.store} (${l.estimate.seen}), ${l.packs} = ~${money.format(l.estUsd ?? 0)}`;

  return 'no price known';
}

function textLine(l: BomLine, money: Money): string {
  const qty = l.unit === 'g' ? `${l.qty} g` : `${l.qty}×`;

  return `- ${qty} ${l.name} [${l.key}] · ${textPrice(l, money)}${l.warning ? ` · ${l.warning}` : ''}`;
}

function textNotes(bom: Bom, names: Record<string, string>): string[] {
  const out: string[] = [];

  if (bom.printed.length) {
    const fil = Object.entries(bom.filamentG)
      .map(([m, g]) => `${m} ${Math.round(g ?? 0)} g`)
      .join(', ');

    out.push(
      '',
      `Printed: ${bom.printed.length} ${bom.printed.length === 1 ? 'part' : 'parts'}, ${fil} (estimate, no supports).`,
    );
  }

  if (bom.standIns.length)
    out.push(
      '',
      `Stand-ins (estimated block-outs; replace with catalog parts or model_part): ${bom.standIns.map((s) => s.id).join(', ')}`,
    );

  if (bom.madeElsewhere.length)
    out.push(
      '',
      `Need a source (no listing): ${bom.madeElsewhere.map((m) => `${m.id} (${m.process})`).join(', ')}. Prefer catalog parts or printed parts.`,
    );

  if (bom.unmeasured.length)
    out.push('', `Not measured yet: ${bom.unmeasured.map((id) => names[id] ?? id).join(', ')}`);

  return out;
}

export function bomText(bom: Bom, names: Record<string, string>, money: Money = currentMoney()): string {
  const out: string[] = [
    textSummary(bom.totals, money),
    "Checked prices are the user's own Amazon listing checks; estimates are maker or distributor list prices. Never state or guess any other price.",
    ...currencyNote(money),
  ];

  for (const { cat, ls } of byCategory(bom)) out.push('', `${cat}:`, ...ls.map((l) => textLine(l, money)));

  out.push(...textNotes(bom, names));

  return out.join('\n');
}
