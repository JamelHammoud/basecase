import type { PrintRecord, ScenePart } from '../types/robotics';
import { isPrinted } from '../utils/bom';
import type { Plate } from './plan';

export type PlateState = 'new' | 'sent' | 'printing' | 'printed' | 'failed';

export interface PlateStatus {
  state: PlateState;
  record?: PrintRecord;
}

const latest = (records: PrintRecord[]) => [...records].sort((a, b) => b.sentAt.localeCompare(a.sentAt));

function stateOf(record: PrintRecord | undefined): PlateState {
  if (!record || record.state === 'cancelled' || record.state === 'reprint') return 'new';

  return record.state;
}

function keysFrom(records: PrintRecord[]): Map<string, string> {
  const keys = new Map<string, string>();
  const seen = new Set<string>();

  for (const r of records.filter((r) => r.state === 'printed' || r.state === 'reprint')) {
    for (const p of r.parts.filter((p) => !seen.has(p.id))) {
      seen.add(p.id);

      if (r.state === 'printed') keys.set(p.id, p.key);
    }
  }

  return keys;
}

export const printedKeys = (records: PrintRecord[] = []) => keysFrom(latest(records));

export type PlateStatusLookup = (plate: Plate) => PlateStatus;

export function plateStatusLookup(records: PrintRecord[] = []): PlateStatusLookup {
  const ordered = latest(records);
  const printed = keysFrom(ordered);
  const hashes = new Map<string, { record: PrintRecord; rank: number }>();
  const replacements = new Map<string, { record: PrintRecord; rank: number }>();

  ordered.forEach((record, rank) => {
    const entry = { record, rank };
    const { hash } = record;

    if (!hashes.has(hash)) hashes.set(hash, entry);

    if (record.state !== 'reprint') return;

    for (const part of record.parts) {
      if (!printed.has(part.id) && !replacements.has(part.id)) replacements.set(part.id, entry);
    }
  });

  return (plate) => {
    let found = hashes.get(plate.hash);

    for (const item of plate.items) {
      const replacement = replacements.get(item.id);

      if (replacement && (!found || replacement.rank < found.rank)) found = replacement;
    }

    const record = found?.record;

    return { state: stateOf(record), record: record?.state === 'reprint' ? undefined : record };
  };
}

export function splitPrinted(parts: ScenePart[], records: PrintRecord[] = [], keyOf: (p: ScenePart) => string) {
  const keys = printedKeys(records);
  const printed = parts.filter((p) => keys.get(p.id) === keyOf(p));

  return { printed, remaining: parts.filter((p) => keys.get(p.id) !== keyOf(p)) };
}

interface PrintedScene {
  parts: ScenePart[];
  records?: PrintRecord[];
  keyOf: (p: ScenePart) => string;
}

export function readySteps(steps: string[][], { parts, records, keyOf }: PrintedScene): boolean[] {
  const keys = printedKeys(records);
  const byId = new Map(parts.map((p) => [p.id, p]));

  return steps.map((ids) => {
    const printed = ids.flatMap((id) => {
      const part = byId.get(id);

      return part && isPrinted(part) && !part.print?.skip ? [part] : [];
    });

    return printed.length > 0 && printed.every((p) => keys.get(p.id) === keyOf(p));
  });
}

export function printRecordFor(
  plate: Plate,
  ctx: { parts: ScenePart[]; keyOf: (p: ScenePart) => string; printer: string; now: Date },
): PrintRecord {
  const byId = new Map(ctx.parts.map((p) => [p.id, p]));
  const ids = [...new Set(plate.items.map((it) => it.id))];

  return {
    id: `print-${ctx.now.getTime().toString(36)}-${plate.number}`,
    plate: plate.number,
    material: plate.material,
    hash: plate.hash,
    parts: ids.flatMap((id) => (byId.has(id) ? [{ id, key: ctx.keyOf(byId.get(id)!) }] : [])),
    printer: ctx.printer,
    sentAt: ctx.now.toISOString(),
    state: 'sent',
  };
}

export const MAX_RECORDS = 200;

export function withRecord(records: PrintRecord[] = [], record: PrintRecord): PrintRecord[] {
  return [record, ...records.filter((r) => r.id !== record.id)].slice(0, MAX_RECORDS);
}

export function markForReprint(records: PrintRecord[], id: string, now = new Date()): PrintRecord[] {
  const original = latest(records).find((r) => r.parts.some((p) => p.id === id));

  if (!original) return records;

  const marker = `reprint-${now.getTime().toString(36)}-${id}`;

  return withRecord(records, {
    ...original,
    id: marker,
    hash: marker,
    plate: 0,
    parts: original.parts.filter((p) => p.id === id),
    sentAt: now.toISOString(),
    state: 'reprint',
  });
}

export function updateRecord(records: PrintRecord[] = [], id: string, patch: Partial<PrintRecord>): PrintRecord[] {
  return records.map((r) => (r.id === id ? { ...r, ...patch } : r));
}
