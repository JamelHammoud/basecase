import { checkedPurchasingEvidence } from '../../electron/backend/offerValidation.mjs';
import type { Purchases } from '../types/robotics';
import type { BomLine } from '../utils/bomTypes';
import { onHandOf, ownedSplit } from '../utils/onHand';
import { comparePurchasing } from '../utils/supplierOffers';
import { boundedInteger, finiteValue, recordValue, stringValue } from './recordValues';
import {
  sourcingBom,
  sourcingSnapshot,
  validSourcingRequirements,
  type StudySourcingSnapshot,
  type StudyPurchasingResult,
} from './sourcing';

const nonnegative = (value: unknown) => finiteValue(value) && value >= 0;

function validPurchases(value: unknown): value is Purchases {
  if (!recordValue(value) || Object.keys(value).length > 100000) return false;

  return Object.values(value).every((record) => {
    if (!recordValue(record) || record.reservations !== undefined || record.printOutput !== undefined) return false;

    checkedPurchasingEvidence(record);

    return record.onHand === undefined || boundedInteger(record.onHand, 100000);
  });
}

function validSnapshot(value: unknown): value is StudySourcingSnapshot {
  if (!recordValue(value) || !validSourcingRequirements(value.requirements) || !validPurchases(value.purchases))
    return false;

  return (
    typeof value.evaluatedAt === 'string' &&
    Number.isFinite(Date.parse(value.evaluatedAt)) &&
    value.evaluatedAt === new Date(value.evaluatedAt).toISOString() &&
    value.id === sourcingSnapshot(value.requirements, value.purchases, value.evaluatedAt).id
  );
}

function validLine(value: unknown): value is BomLine {
  if (!recordValue(value)) return false;

  return (
    ['key', 'name', 'category', 'detail', 'urlKind'].every((key) => stringValue(value[key])) &&
    ['qty', 'owned', 'toBuy'].every((key) => nonnegative(value[key])) &&
    ['pcs', 'g'].includes(String(value.unit)) &&
    Array.isArray(value.partIds) &&
    value.partIds.every(stringValue)
  );
}

function validBom(value: unknown): boolean {
  if (!recordValue(value)) return false;

  return (
    ['printed', 'standIns', 'unmeasured', 'madeElsewhere'].every((key) => Array.isArray(value[key])) &&
    recordValue(value.filamentG) &&
    recordValue(value.totals)
  );
}

function validPurchasing(value: unknown, snapshot: StudySourcingSnapshot): boolean {
  if (!recordValue(value) || !Array.isArray(value.lines) || value.lines.length > 100000 || !validBom(value.bom))
    return false;

  const validLines = value.lines.every((item) => {
    if (!recordValue(item) || !validLine(item.line)) return false;

    const split = ownedSplit(item.line.qty, onHandOf(snapshot.purchases[item.line.key]));

    return item.line.owned === split.owned && item.line.toBuy === split.toBuy;
  });

  if (!validLines || value.evidenceId !== snapshot.id || value.generatedAt !== snapshot.evaluatedAt) return false;

  const result = value as unknown as StudyPurchasingResult;
  const { evidenceId, bom, ...saved } = result;
  const compared = comparePurchasing({
    bom: sourcingBom(result),
    purchases: snapshot.purchases,
    plan: snapshot.requirements,
    now: snapshot.evaluatedAt,
  });

  return (
    !!evidenceId &&
    !!bom &&
    JSON.stringify(saved) ===
      JSON.stringify({
        ...compared,
        plan: { destination: snapshot.requirements.destination, requiredBy: snapshot.requirements.requiredBy },
      })
  );
}

export function validSourcingRecord(record: Record<string, unknown>): boolean {
  if (!recordValue(record.current) || !Array.isArray(record.rows) || !record.rows.every(recordValue)) return false;

  const rows = [record.current, ...record.rows];

  if (record.sourcing === undefined) return rows.every((row) => row.purchasing === undefined);

  try {
    if (!validSnapshot(record.sourcing)) return false;

    const snapshot = record.sourcing;

    return rows.every((row) => (row.error ? row.purchasing === undefined : validPurchasing(row.purchasing, snapshot)));
  } catch {
    return false;
  }
}
