import type { PrintRecord, ScenePart } from '../types/robotics';
import type { Plate } from './plan';

export type PlateState = 'new' | 'sent' | 'printing' | 'printed' | 'failed';

export interface PlateStatus {
  state: PlateState;
  record?: PrintRecord;
}

const latest = (records: PrintRecord[]) => [...records].sort((a, b) => b.sentAt.localeCompare(a.sentAt));

function stateOf(record: PrintRecord | undefined): PlateState {
  if (!record || record.state === 'cancelled') return 'new';

  return record.state;
}

export function plateStatus(plate: Plate, records: PrintRecord[] = []): PlateStatus {
  const record = latest(records).find((r) => r.hash === plate.hash);

  return { state: stateOf(record), record };
}

export function printedKeys(records: PrintRecord[] = []): Map<string, string> {
  const keys = new Map<string, string>();

  for (const r of latest(records).filter((r) => r.state === 'printed'))
    for (const p of r.parts) if (!keys.has(p.id)) keys.set(p.id, p.key);

  return keys;
}

export function splitPrinted(parts: ScenePart[], records: PrintRecord[] = [], keyOf: (p: ScenePart) => string) {
  const keys = printedKeys(records);
  const printed = parts.filter((p) => keys.get(p.id) === keyOf(p));

  return { printed, remaining: parts.filter((p) => keys.get(p.id) !== keyOf(p)) };
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

export function updateRecord(records: PrintRecord[] = [], id: string, patch: Partial<PrintRecord>): PrintRecord[] {
  return records.map((r) => (r.id === id ? { ...r, ...patch } : r));
}
