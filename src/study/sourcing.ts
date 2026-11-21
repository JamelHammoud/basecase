import type { PurchasePlan } from '../types/purchasing';
import type { PurchaseRecord, Purchases } from '../types/robotics';
import type { Bom } from '../utils/bomTypes';
import { onHandOf, ownedSplit } from '../utils/onHand';
import { purchaseSnapshot } from '../utils/purchaseSnapshot';
import { hashText } from '../utils/geometryHash';
import { comparePurchasing, type PurchasingComparison } from '../utils/supplierOffers';
import { boundedInteger, recordValue } from './recordValues';

export interface StudySourcingRequirements extends PurchasePlan {
  quantity: number;
}

export interface StudySourcingSnapshot {
  requirements: StudySourcingRequirements;
  purchases: Purchases;
  evaluatedAt: string;
  id: string;
}

export interface StudyPurchasingResult extends PurchasingComparison {
  evidenceId: string;
  bom: Omit<Bom, 'lines'>;
}

export function validSourcingRequirements(value: unknown): value is StudySourcingRequirements {
  if (!recordValue(value)) return false;

  return (
    typeof value.destination === 'string' &&
    value.destination.trim().length > 0 &&
    value.destination.length <= 2048 &&
    typeof value.requiredBy === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.requiredBy) &&
    Number.isFinite(Date.parse(value.requiredBy)) &&
    new Date(value.requiredBy).toISOString().slice(0, 10) === value.requiredBy &&
    boundedInteger(value.quantity, 100000) &&
    (value.quantity as number) > 0
  );
}

const normalizedPurchases = (purchases: Purchases) =>
  Object.fromEntries(Object.entries(purchaseSnapshot(purchases)).sort(([a], [b]) => a.localeCompare(b)));

export function sourcingSnapshot(
  requirements: StudySourcingRequirements,
  purchases: Purchases,
  evaluatedAt: string,
): StudySourcingSnapshot {
  const evidence = JSON.parse(JSON.stringify(normalizedPurchases(purchases))) as Purchases;
  const captured = { requirements: { ...requirements }, purchases: evidence, evaluatedAt };

  return { ...captured, id: hashText(JSON.stringify(captured)) };
}

function sourcingPrice(record: PurchaseRecord | undefined): PurchaseRecord | undefined {
  if (!record) return undefined;

  const { identity, url, asin, title, packQty, priceUsd, entered, checkedAt, note, onHand } = record;

  return { identity, url, asin, title, packQty, priceUsd, entered, checkedAt, note, onHand };
}

export function studyPurchasing(bom: Bom, snapshot: StudySourcingSnapshot): StudyPurchasingResult {
  const { requirements, purchases, evaluatedAt } = snapshot;
  const { lines, ...details } = bom;
  const scaled = lines.map((line) => {
    const qty = line.qty * requirements.quantity;
    const split = ownedSplit(qty, onHandOf(purchases[line.key]));

    return { ...line, record: sourcingPrice(line.record), qty, ...split };
  });
  const compared = comparePurchasing({
    bom: { ...details, lines: scaled },
    purchases,
    plan: { destination: requirements.destination, requiredBy: requirements.requiredBy },
    now: evaluatedAt,
  });

  return { ...compared, evidenceId: snapshot.id, bom: details };
}

export const sourcingBom = (result: StudyPurchasingResult): Bom => ({
  ...result.bom,
  lines: result.lines.map((item) => item.line),
});

function comparisonValue(result: PurchasingComparison) {
  return JSON.stringify({
    lines: result.lines.map(({ line, ...comparison }) => ({
      key: line.key,
      qty: line.qty,
      owned: line.owned,
      toBuy: line.toBuy,
      identity: line.identity,
      ...comparison,
    })),
    totals: result.totals,
    estimatedArrival: result.estimatedArrival,
    purchasingComplete: result.purchasingComplete,
    unresolved: result.unresolved,
  });
}

export function sourcingUnchanged({
  snapshot,
  result,
  purchases,
  now,
  current = result,
}: {
  snapshot: StudySourcingSnapshot;
  result: StudyPurchasingResult;
  purchases: Purchases;
  now: string;
  current?: StudyPurchasingResult;
}): boolean {
  const evidence = sourcingSnapshot(snapshot.requirements, purchases, snapshot.evaluatedAt);

  if (JSON.stringify(evidence) !== JSON.stringify(snapshot)) return false;

  const compared = comparePurchasing({
    bom: sourcingBom(current),
    purchases: evidence.purchases,
    plan: result.plan,
    now,
  });

  return comparisonValue(compared) === comparisonValue(result);
}
