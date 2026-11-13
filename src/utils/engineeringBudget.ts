import { budgetLine, lineUsd } from './budget';
import { buildBom, isPrinted } from './bom';
import type { BomLine } from './bomTypes';
import { formatWhole } from './currencyStore';
import type { CheckContext, CheckRow } from './engineeringTypes';
import { plural } from '../../electron/plural.mjs';

const WARN_SHARE = 0.9;

const qtyOf = (l: BomLine) => (l.unit === 'g' ? `${l.qty} g` : `${l.toBuy}×`);
const BIGGEST = 3;

export function budgetRow(ctx: CheckContext): CheckRow {
  const budget = ctx.project.budgetUsd;

  if (budget === undefined) return { check: 'Budget', status: 'not run', detail: 'No budget set' };

  const bom = buildBom({
    parts: ctx.parts,
    project: ctx.project,
    purchases: ctx.input.purchases ?? {},
    measures: ctx.measures,
    supportG: ctx.input.supportG,
  });
  const est = bom.totals.estimatedUsd;
  let status: CheckRow['status'] = 'pass';

  if (est > budget) status = 'fail';
  else if (est > WARN_SHARE * budget) status = 'warn';

  const unpriced = bom.totals.unpriced ? `; no price on ${plural(bom.totals.unpriced, 'line')}` : '';
  const noSupport = !ctx.input.supportG && ctx.parts.some(isPrinted) ? '; support filament not counted' : '';
  const biggest = [...bom.lines].sort((a, b) => lineUsd(b) - lineUsd(a)).slice(0, BIGGEST);

  return {
    check: 'Budget',
    status,
    detail: `${budgetLine(bom)}${unpriced}${noSupport}`,
    itemsAreContext: true,
    items:
      status === 'pass'
        ? []
        : biggest.map((l) => ({ text: `${qtyOf(l)} ${l.name}: ≈ ${formatWhole(lineUsd(l))}`, ids: l.partIds })),
  };
}
