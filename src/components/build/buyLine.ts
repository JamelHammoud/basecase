import type { BomLine } from '../../utils/bom';
import { plural } from './format';

export const lineQty = (l: BomLine) => (l.unit === 'g' ? `${l.qty.toLocaleString('en-US')} g` : `${l.qty}×`);

export function linePacks(l: BomLine) {
  if (!l.packs || !(l.record || l.unit === 'g')) return '';

  const word = l.unit === 'g' ? plural(l.packs, 'spool', 'spools') : plural(l.packs, 'pack', 'packs');

  return `${l.packs} ${word}`;
}

export const linkLabel = (l: BomLine) => (l.urlKind === 'product' ? 'Open listing' : 'Search Amazon');
