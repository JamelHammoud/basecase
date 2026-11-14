import type { PrintMaterial, PrintQuote, ScenePart } from '../types/robotics';
import { hashText } from '../utils/geometryHash';
import { shapeKey } from './shapeKey';

export const copiesOf = (p: ScenePart) => p.print?.copies ?? 1;

export const quoteKey = (p: ScenePart, material: PrintMaterial): string =>
  hashText([shapeKey(p), p.print?.down?.join(',') ?? '', material, copiesOf(p)].join('|'));

export const quoteOf = (part: string, quotes: PrintQuote[] = []) => quotes.find((q) => q.part === part);
