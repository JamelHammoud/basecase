import { BOM_CATEGORIES, type Bom, type BomCategory, type BomLine } from '../../utils/bomTypes';
import { plural } from '../../../electron/plural.mjs';

export interface BomGroup {
  category: BomCategory;
  lines: BomLine[];
  usd?: number;
  estimated: boolean;
  attention: boolean;
}

export const lineCount = (l: BomLine) => `${l.unit === 'g' ? (l.packs ?? 1) : l.toBuy}×`;

export function lineAmount(l: BomLine) {
  if (l.unit === 'g') return `${l.qty.toLocaleString('en-US')} g`;

  return l.packs && l.record ? plural(l.packs, 'pack') : '';
}

export const ownedAmount = (l: BomLine) =>
  l.owned ? `${l.owned.toLocaleString('en-US')}${l.unit === 'g' ? ' g' : ''} on hand` : '';

export const linkLabel = (l: BomLine) => (l.urlKind === 'product' ? 'Open listing' : 'Search Amazon');

const linePrice = (l: BomLine) => l.lineUsd ?? l.estUsd;

function groupOf(category: BomCategory, lines: BomLine[]): BomGroup {
  const priced = lines.map(linePrice).filter((usd) => usd !== undefined);

  return {
    category,
    lines,
    usd: priced.length ? priced.reduce((sum, usd) => sum + usd, 0) : undefined,
    estimated: lines.some((l) => l.lineUsd === undefined),
    attention: lines.some((l) => l.warning || l.status === 'stale'),
  };
}

export function bomGroups(bom: Pick<Bom, 'lines'>): BomGroup[] {
  return BOM_CATEGORIES.map((category) =>
    groupOf(
      category,
      bom.lines.filter((l) => l.category === category),
    ),
  ).filter((group) => group.lines.length);
}
