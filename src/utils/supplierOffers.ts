import type { ConfirmedOffer, PurchaseIdentity, PurchasePlan, SupplierOffer } from '../types/purchasing';
import type { Purchases } from '../types/robotics';
import type { Bom, BomLine } from './bomTypes';
import { supplierOrderQty } from './purchaseIdentity';
import { csvCell } from './csvCell';

export const identityStamp = (identity: PurchaseIdentity | undefined) =>
  JSON.stringify([
    identity?.manufacturer,
    identity?.mpn,
    identity?.supplier,
    identity?.supplierPartNumber,
    identity?.orderingUnit,
    identity?.unitsPerOrder,
    identity?.sourceUrl,
  ]);

export function confirmOffer(offer: SupplierOffer, line: BomLine, unitsPerOrder: number): ConfirmedOffer {
  return { offer, matchedIdentity: identityStamp(line.identity), unitsPerOrder };
}

export const exactOffer = (offer: SupplierOffer, line: BomLine) =>
  !!line.identity?.manufacturer?.trim() &&
  !!line.identity.mpn?.trim() &&
  offer.identity.manufacturer === line.identity.manufacturer &&
  offer.identity.mpn === line.identity.mpn;

export interface OfferComparison {
  line: BomLine;
  selected?: ConfirmedOffer;
  orderQty?: number;
  total?: number;
  issues: string[];
}

export interface PurchasingComparison {
  plan: PurchasePlan;
  generatedAt: string;
  lines: OfferComparison[];
  totals: Record<string, number>;
  estimatedArrival?: string;
  purchasingComplete: boolean;
  unresolved: string[];
}

function arrivalIssues(offer: SupplierOffer, plan: PurchasePlan, now: string): string[] {
  const conditions: Array<[boolean, string]> = [
    [!offer.arrivalLatest || !offer.arrivalEarliest, 'Unknown arrival'],
    [!plan.requiredBy, 'Set required arrival date'],
    [
      !!plan.requiredBy && !!offer.arrivalLatest && offer.arrivalLatest > plan.requiredBy,
      'Arrives after required date',
    ],
    [!!offer.arrivalLatest && offer.arrivalLatest < now.slice(0, 10), 'Stale arrival'],
  ];

  return conditions.filter(([applies]) => applies).map(([, issue]) => issue);
}

function evidenceIssues(offer: SupplierOffer, plan: PurchasePlan, now: string): string[] {
  const observed = offer.observedAt ? Date.parse(offer.observedAt) : NaN;
  const conditions: Array<[boolean, string]> = [
    [!Number.isFinite(observed) || observed > Date.parse(now), 'Unknown observation date'],
    [Date.parse(now) - observed > 60 * 86_400_000, 'Stale evidence'],
    [!!offer.expiresAt && Date.parse(offer.expiresAt) <= Date.parse(now), 'Expired evidence'],
    [!plan.destination || offer.destination !== plan.destination, 'Destination mismatch'],
  ];

  return [...conditions.filter(([applies]) => applies).map(([, issue]) => issue), ...arrivalIssues(offer, plan, now)];
}

function quantityIssues(offer: SupplierOffer, orderQty: number | undefined): string[] {
  if (orderQty === undefined) return ['Unknown packaging'];

  if (offer.availableOrders === undefined) return ['Unknown availability'];

  if (offer.availableOrders === 0 && orderQty > 0) return ['Unavailable'];

  return offer.availableOrders < orderQty ? ['Partial fulfillment'] : [];
}

function orderTotal(offer: SupplierOffer, qty: number | undefined): number | undefined {
  if (qty === 0) return 0;

  if (qty === undefined) return undefined;

  let priceBreak: SupplierOffer['breaks'][number] | undefined;

  for (const item of offer.breaks) {
    if (item.minOrders <= qty && (!priceBreak || item.minOrders > priceBreak.minOrders)) priceBreak = item;
  }

  const total = priceBreak ? Number((priceBreak.price * qty).toFixed(6)) : NaN;

  return Number.isFinite(total) && total <= Number.MAX_SAFE_INTEGER ? total : undefined;
}

export function compareOffer(
  line: BomLine,
  selected: ConfirmedOffer | undefined,
  plan: PurchasePlan,
  now: string,
): OfferComparison {
  if (!selected)
    return {
      line,
      issues: line.toBuy > 0 ? ['Select an offer'] : [],
      orderQty: line.toBuy === 0 ? 0 : undefined,
      total: line.toBuy === 0 ? 0 : undefined,
    };

  const { offer, unitsPerOrder } = selected;
  const orderQty = supplierOrderQty(line.toBuy, { ...offer.identity, unitsPerOrder });
  const total = orderTotal(offer, orderQty);
  const issues = [...evidenceIssues(offer, plan, now), ...quantityIssues(offer, orderQty)];

  if (!exactOffer(offer, line)) issues.push('Unresolved identity');

  if (selected.matchedIdentity !== identityStamp(line.identity)) issues.push('Confirm match and packaging');

  if (total === undefined && orderQty !== undefined) issues.push('Quantity break unavailable');

  return { line, selected, orderQty, total, issues: line.toBuy > 0 ? issues : [] };
}

export function comparePurchasing({
  bom,
  purchases,
  plan,
  now = new Date().toISOString(),
}: {
  bom: Bom;
  purchases: Purchases;
  plan: PurchasePlan;
  now?: string;
}): PurchasingComparison {
  const lines = bom.lines.map((line) => {
    const book = purchases[line.key]?.supplierOffers;

    return compareOffer(
      line,
      book?.offers.find((item) => item.offer.id === book.selectedId),
      plan,
      now,
    );
  });
  const totals: Record<string, number> = {};

  for (const item of lines) {
    if (item.total !== undefined && item.selected)
      totals[item.selected.offer.currency] = (totals[item.selected.offer.currency] ?? 0) + item.total;
  }

  const arrivals = lines
    .filter((item) => item.line.toBuy > 0)
    .map((item) => item.selected?.offer.arrivalLatest)
    .filter((date): date is string => !!date)
    .sort();
  const purchasingResolved = lines.every((item) => item.issues.length === 0);
  const unresolved = ['Assembly duration unresolved'];

  if (bom.printed.length || bom.unmeasured.length) unresolved.push('Printed parts unresolved');

  if (bom.madeElsewhere.length) unresolved.push('Fabrication unresolved');

  if (bom.standIns.length) unresolved.push('Part identities unresolved');

  return {
    plan,
    generatedAt: now,
    lines,
    totals,
    purchasingComplete: purchasingResolved,
    estimatedArrival: purchasingResolved ? arrivals.at(-1) : undefined,
    unresolved,
  };
}

const HEADERS = [
  'Customer Reference',
  'Item',
  'Qty Needed',
  'On Hand',
  'Remaining Units',
  'Manufacturer',
  'Manufacturer Part Number',
  'Supplier',
  'Supplier Part Number',
  'Ordering Unit',
  'Units per Order',
  'Supplier Order Qty',
  'Currency',
  'Line Total',
  'Destination',
  'Required Arrival Date',
  'Quoted Arrival Earliest',
  'Quoted Arrival Latest',
  'Observed At',
  'Expires At',
  'Source Reference',
  'Evidence',
  'Status',
  'Generated At',
  'Purchasing Arrival Estimate',
  'Quoted Units per Order',
  'Available Orders',
  'Quote Destination',
  'Quantity Breaks',
  'Import Reference',
  'Confirmed Identity',
  'Purchasing Evidence Complete',
];

function identityCells(item: OfferComparison): unknown[] {
  const identity = item.selected?.offer.identity ?? item.line.identity ?? {};

  return [identity.manufacturer, identity.mpn, identity.supplier, identity.supplierPartNumber, identity.orderingUnit];
}

export const purchasingStatus = (item: OfferComparison) =>
  item.line.toBuy === 0 ? 'Owned stock sufficient' : item.issues.join(', ') || 'Sufficient stock';

function exportLine(item: OfferComparison, result: PurchasingComparison): unknown[] {
  const { line, selected } = item;
  const offer = selected?.offer;
  const status = purchasingStatus(item);

  return [
    line.key,
    line.name,
    line.qty,
    line.owned,
    line.toBuy,
    ...identityCells(item),
    selected?.unitsPerOrder,
    item.orderQty,
    offer?.currency,
    item.total,
    result.plan.destination,
    result.plan.requiredBy,
    ...evidenceCells(offer),
    status,
    result.generatedAt,
    result.estimatedArrival,
    offer?.identity.unitsPerOrder,
    offer?.availableOrders,
    offer?.destination,
    offer?.breaks.map((item) => `${item.minOrders}:${item.price}`).join('|'),
    offer?.importReference,
    selected?.matchedIdentity,
    result.purchasingComplete,
  ];
}

function evidenceCells(offer: SupplierOffer | undefined): unknown[] {
  return [
    offer?.arrivalEarliest,
    offer?.arrivalLatest,
    offer?.observedAt,
    offer?.expiresAt,
    offer?.source,
    offer?.evidence,
  ];
}

export function purchasingCsv(result: PurchasingComparison): string {
  const rows = result.lines.map((item) => exportLine(item, result));
  const statusColumn = HEADERS.indexOf('Status');

  for (const issue of result.unresolved) {
    const row = Array<unknown>(HEADERS.length).fill('');

    row[statusColumn] = issue;
    rows.push(row);
  }

  return [HEADERS, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}
