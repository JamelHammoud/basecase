import type { PrintMaterial, PrintQuote, ProjectSettings, ScenePart } from '../types/robotics';
import { isMadePart, printMaterialOf } from '../utils/bom';
import { bedMatrixOf, type Plate } from './plan';
import { copiesOf, quoteKey, quoteOf } from './quoteKey';

export interface QuoteRequest {
  part: string;
  key: string;
  name: string;
  material: PrintMaterial;
  copies: number;
}

export interface QuoteReply {
  part: string;
  usd?: number;
  refusal?: string;
}

export function quotesWanted(parts: ScenePart[], project: ProjectSettings, skip: Set<string> = new Set()) {
  if (project.madeBy !== 'service') return [];

  return parts.filter(isMadePart).flatMap((p): QuoteRequest[] => {
    const material = printMaterialOf(p, project);
    const key = quoteKey(p, material);

    if (quoteOf(p.id, project.quotes)?.key === key || skip.has(key)) return [];

    return [{ part: p.id, key, name: p.name, material, copies: copiesOf(p) }];
  });
}

export function withQuotes(
  quotes: PrintQuote[] = [],
  asked: QuoteRequest[],
  ctx: { replies: QuoteReply[]; checkedAt: string; parts: ScenePart[] },
): PrintQuote[] {
  const made = new Set(ctx.parts.filter(isMadePart).map((p) => p.id));
  const byPart = new Map(ctx.replies.map((r) => [r.part, r]));
  const fresh = asked.flatMap((a): PrintQuote[] => {
    const reply = byPart.get(a.part);

    if (!reply) return [];

    return [
      {
        part: a.part,
        key: a.key,
        material: a.material,
        copies: a.copies,
        ...(reply.usd === undefined ? {} : { usd: reply.usd }),
        ...(reply.refusal ? { refusal: reply.refusal } : {}),
        checkedAt: ctx.checkedAt,
      },
    ];
  });
  const replaced = new Set(fresh.map((q) => q.part));

  return [...quotes.filter((q) => !replaced.has(q.part)), ...fresh].filter((q) => made.has(q.part));
}

export const stlItems = (asked: QuoteRequest[], plates: Plate[]) =>
  asked.map((a) => ({ id: a.part, matrix: bedMatrixOf(plates, a.part) }));
