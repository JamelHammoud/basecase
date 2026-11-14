import { copiesOf, quoteKey, quoteOf } from '../print/quoteKey';
import type { PrintMaterial, PrintQuote, ScenePart } from '../types/robotics';
import { type BomLine, type PriceStatus, STALE_DAYS, daysSince } from './bomTypes';

export const PRINTED_LINE = 'printed:';

export interface PrintedLineInput {
  part: ScenePart;
  material: PrintMaterial;
  quotes?: PrintQuote[];
  now: Date;
}

function quoteStatus(quote: PrintQuote | undefined, fresh: boolean, ageDays: number | undefined): PriceStatus {
  if (quote?.usd === undefined) return 'unchecked';

  return !fresh || ageDays! > STALE_DAYS ? 'stale' : 'checked';
}

export function printedLine({ part, material, quotes, now }: PrintedLineInput): BomLine {
  const quote = quoteOf(part.id, quotes);
  const fresh = quote?.key === quoteKey(part, material);
  const ageDays = quote ? daysSince(quote.checkedAt, now) : undefined;
  const status = quoteStatus(quote, fresh, ageDays);

  return {
    key: `${PRINTED_LINE}${part.id}`,
    category: 'Printed parts',
    name: part.name,
    detail: material,
    qty: copiesOf(part),
    owned: 0,
    toBuy: copiesOf(part),
    unit: 'pcs',
    partIds: [part.id],
    urlKind: 'none',
    quote,
    status,
    ageDays,
    lineUsd: status === 'unchecked' ? undefined : quote!.usd,
    warning: fresh ? quote?.refusal : undefined,
  };
}
