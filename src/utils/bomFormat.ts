import { BOM_CATEGORIES, Bom, BomLine, FILAMENT_MARGIN, PriceStatus, STALE_DAYS, localDate } from './bomTypes';

const STATUS_LABEL: Record<PriceStatus, string> = { checked: 'Checked', stale: 'Stale', unchecked: 'Not checked' };
const LINK_TYPE: Record<BomLine['urlKind'], string> = { product: 'Listing', search: 'Search', none: '' };
const CSV_HEAD = [
  'Item',
  'Category',
  'Maker / Spec',
  'Qty Needed',
  'Unit',
  'Pack Qty',
  'Packs to Buy',
  'Pack Price (USD)',
  'Line Total (USD)',
  'Link',
  'Link Type',
  'ASIN',
  'Listing Title',
  'Price Checked',
  'Price Status',
  'Estimate (USD)',
  'Estimate Source',
  'Estimate Seen',
  'Note',
  'Used By',
];

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);

  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const usd = (n?: number) => (n === undefined ? '' : n.toFixed(2));
const byCategory = (bom: Bom) =>
  BOM_CATEGORIES.map((cat) => ({ cat, ls: bom.lines.filter((l) => l.category === cat) })).filter((g) => g.ls.length);

const recordCells = (l: BomLine) => [
  l.record?.asin ?? '',
  l.record?.title ?? '',
  l.record?.checkedAt ?? '',
  STATUS_LABEL[l.status],
];

const estimateCells = (l: BomLine) => [
  usd(l.estUsd),
  l.estimate ? `${l.estimate.store} ${l.estimate.url}` : '',
  l.estimate?.seen ?? '',
];

const csvRow = (l: BomLine, partNames: Record<string, string>) => [
  l.name,
  l.category,
  l.detail,
  l.qty,
  l.unit,
  l.record?.packQty ?? (l.category === 'Filament' ? 1000 : ''),
  l.packs ?? '',
  usd(l.record?.priceUsd),
  usd(l.lineUsd),
  l.url ?? '',
  LINK_TYPE[l.urlKind],
  ...recordCells(l),
  ...estimateCells(l),
  [l.warning, l.record?.note].filter(Boolean).join('; '),
  [...new Set(l.partIds.map((id) => partNames[id] ?? id))].slice(0, 12).join('; '),
];

export function bomToCsv(bom: Bom, partNames: Record<string, string>): string {
  const rows = bom.lines.map((l) => csvRow(l, partNames));

  return [CSV_HEAD, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

function markdownTotals(t: Bom['totals']): string[] {
  const out = [`- **Checked total:** $${t.checkedUsd.toFixed(2)} (${t.checked} lines)`];

  if (t.stale)
    out.push(
      `- **Stale checks** (over ${STALE_DAYS} days): ${t.stale} lines, $${(t.pricedUsd - t.checkedUsd).toFixed(2)}`,
    );

  if (t.unchecked) out.push(`- **Not checked:** ${t.unchecked} lines, not in the checked total`);

  out.push(
    `- **Estimated total:** ~$${t.estimatedUsd.toFixed(2)}, using maker and distributor list prices (marked ~) for unchecked lines${t.unpriced ? `; ${t.unpriced} lines have no price` : ''}`,
  );

  if (t.budgetUsd !== undefined)
    out.push(`- **Budget:** $${t.budgetUsd.toFixed(2)}${t.overBudget ? ' (over budget)' : ''}`);

  return out;
}

function markdownPrice(l: BomLine): string {
  if (l.lineUsd !== undefined) return `$${l.lineUsd.toFixed(2)}`;

  return l.estUsd !== undefined ? `~$${l.estUsd.toFixed(2)} ([list](${l.estimate!.url}))` : '';
}

function markdownRow(l: BomLine): string {
  const qty = l.unit === 'g' ? `${l.qty} g` : String(l.qty);
  const link = l.url ? `[${l.urlKind === 'product' ? 'Listing' : 'Search'}](${l.url})` : '';
  const name = `${l.name}${l.detail ? ` <br>${l.detail}` : ''}${l.warning ? ` <br>⚠ ${l.warning}` : ''}`;
  const checked = l.record ? `${l.record.checkedAt}${l.status === 'stale' ? ' (stale)' : ''}` : 'Not checked';

  return `| ${name} | ${qty} | ${l.packs ?? ''} | ${markdownPrice(l)} | ${checked} | ${link} |`;
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

export function bomToMarkdown(bom: Bom, sceneName: string, today = new Date()): string {
  const out: string[] = [
    `# ${sceneName}: bill of materials`,
    '',
    `Generated ${localDate(today)} from the scene. Prices are what was seen on each listing on its check date; Amazon prices change, so recheck before ordering.`,
    '',
    ...markdownTotals(bom.totals),
    '',
  ];

  for (const { cat, ls } of byCategory(bom))
    out.push(
      `## ${cat}`,
      '',
      '| Item | Qty | Packs | Price | Checked | Link |',
      '|---|---:|---:|---:|---|---|',
      ...ls.map(markdownRow),
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

function textSummary(t: Bom['totals']): string {
  const budget = t.budgetUsd !== undefined ? `Budget $${t.budgetUsd.toFixed(2)}` : 'No budget set';
  const over = t.budgetUsd !== undefined && t.estimatedUsd > t.budgetUsd ? ' The estimate is OVER BUDGET.' : '';

  return (
    `${budget}. Checked prices total $${t.pricedUsd.toFixed(2)} (${t.checked} checked, ${t.stale} stale). With list-price estimates for the rest: ~$${t.estimatedUsd.toFixed(2)}${t.unpriced ? `, plus ${t.unpriced} lines with no price known` : ''}.` +
    over
  );
}

function textPrice(l: BomLine): string {
  if (l.record)
    return `$${l.record.priceUsd.toFixed(2)} per ${l.record.packQty}${l.unit === 'g' ? ' g' : ''}, ${l.packs} to buy = $${(l.lineUsd ?? 0).toFixed(2)} (checked ${l.record.checkedAt}${l.status === 'stale' ? ', stale' : ''})`;

  if (l.estimate)
    return `not checked; list price $${l.estimate.usd.toFixed(2)} per ${l.estimate.per} at ${l.estimate.store} (${l.estimate.seen}), ${l.packs} = ~$${(l.estUsd ?? 0).toFixed(2)}`;

  return 'no price known';
}

function textLine(l: BomLine): string {
  const qty = l.unit === 'g' ? `${l.qty} g` : `${l.qty}×`;

  return `- ${qty} ${l.name} [${l.key}] · ${textPrice(l)}${l.warning ? ` · ${l.warning}` : ''}`;
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

export function bomText(bom: Bom, names: Record<string, string>): string {
  const out: string[] = [
    textSummary(bom.totals),
    "Checked prices are the user's own Amazon listing checks; estimates are maker or distributor list prices. Never state or guess any other price.",
  ];

  for (const { cat, ls } of byCategory(bom)) out.push('', `${cat}:`, ...ls.map(textLine));

  out.push(...textNotes(bom, names));

  return out.join('\n');
}
