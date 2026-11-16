import type { PrintMaterial, PrintQuote, ScenePart } from '../types/robotics';
import { hashText } from '../utils/geometryHash';
import { shapeKey } from './shapeKey';

export const copiesOf = (p: ScenePart) => p.print?.copies ?? 1;

export const quoteKey = (p: ScenePart, material: PrintMaterial): string =>
  hashText([shapeKey(p), p.print?.down?.join(',') ?? '', material, copiesOf(p)].join('|'));

export function quotesByPart(quotes: readonly PrintQuote[] = []): Map<string, PrintQuote> {
  const byPart = new Map<string, PrintQuote>();

  for (const quote of quotes) {
    const part = quote.part;

    if (!byPart.has(part)) byPart.set(part, quote);
  }

  return byPart;
}
