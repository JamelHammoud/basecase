import { describe, expect, it } from 'vitest';
import type { PrintRecord } from '../types/robotics';
import { seededRandom } from '../utils/seededRandom';
import type { Plate } from './plan';
import { plateStatusLookup, type PlateStatus } from './tracker';

const states: PrintRecord['state'][] = ['printed', 'reprint', 'sent', 'printing', 'failed', 'cancelled'];
const record = (id: number, patch: Partial<PrintRecord> = {}): PrintRecord => ({
  id: `record-${id}`,
  plate: id,
  material: 'PLA',
  hash: `hash-${id}`,
  parts: [{ id: `part-${id}`, key: `key-${id}` }],
  printer: 'printer',
  sentAt: new Date(id * 1000).toISOString(),
  state: 'printed',
  ...patch,
});
const plate = (hash: string, ids: string[] = []): Plate => ({
  number: 1,
  local: 1,
  material: 'PLA',
  items: ids.map((id) => ({ id, copy: 0, name: id, x: 0, y: 0, w: 1, d: 1, h: 1, yaw: 0, matrix: [] })),
  grams: 1,
  hours: 1,
  hash,
});

function previousStatus(plate: Plate, records: PrintRecord[]): PlateStatus {
  const ordered = [...records].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const keys = new Map<string, string>();
  const seen = new Set<string>();

  for (const r of ordered.filter((r) => r.state === 'printed' || r.state === 'reprint')) {
    for (const p of r.parts.filter((p) => !seen.has(p.id))) {
      seen.add(p.id);

      if (r.state === 'printed') keys.set(p.id, p.key);
    }
  }

  const ids = new Set(plate.items.map((item) => item.id));
  const found = ordered.find(
    (r) => r.hash === plate.hash || (r.state === 'reprint' && r.parts.some((p) => ids.has(p.id) && !keys.has(p.id))),
  );
  const state = !found || found.state === 'reprint' || found.state === 'cancelled' ? 'new' : found.state;

  return { state, record: found?.state === 'reprint' ? undefined : found };
}

function check(records: PrintRecord[], plates: Plate[]) {
  const lookup = plateStatusLookup(records);

  for (const query of plates) {
    const expected = previousStatus(query, records);
    const actual = lookup(query);

    expect(actual).toEqual(expected);
    expect(actual.record).toBe(expected.record);
    expect(lookup(query)).toEqual(expected);
  }
}

describe('prepared print status', () => {
  it('matches history scans across unordered records, timestamp ties, repeated hashes and shared parts', () => {
    const random = seededRandom('d4e5249f00112233d4e5249f00112233');
    const integer = (limit: number) => Math.floor(random() * limit);

    for (let trial = 0; trial < 120; trial++) {
      const records = Array.from({ length: integer(40) }, (_, id) =>
        record(id, {
          hash: `hash-${integer(10)}`,
          sentAt: ['', 'a', 'A', '2026-11-15T12:00:00.000Z'][integer(4)],
          state: states[integer(states.length)],
          parts: Array.from({ length: integer(8) }, (_, k) => ({ id: `part-${integer(12)}`, key: `key-${id}-${k}` })),
        }),
      );
      const queries = Array.from({ length: 20 }, () =>
        plate(
          `hash-${integer(12)}`,
          Array.from({ length: integer(6) }, () => `part-${integer(14)}`),
        ),
      );

      check(records, queries);
      check([...records].reverse(), queries);
    }
  });

  it('keeps first timestamp ties between hashes and reprints, and ignores replacements printed later', () => {
    const printed = record(1, { hash: 'plate', parts: [{ id: 'a', key: 'old' }] });
    const replacement = record(2, { state: 'reprint', sentAt: printed.sentAt, parts: [{ id: 'a', key: 'old' }] });
    const query = plate('plate', ['a', 'a']);

    expect(plateStatusLookup([printed, replacement])(query).record).toBe(printed);
    expect(plateStatusLookup([replacement, printed])(query)).toEqual({ state: 'new', record: undefined });

    const finished = record(3, { parts: [{ id: 'a', key: 'new' }] });

    expect(plateStatusLookup([replacement, printed, finished])(query).record).toBe(printed);
    check([record(4, { hash: 'plate', state: 'cancelled' }), replacement, printed], [query]);
  });

  it('accepts frozen sources and rebuilds after record, part and plate edits', () => {
    const records = [record(1), record(2, { state: 'reprint' })];
    const query = plate('hash-1', ['part-2']);
    const original = structuredClone(records);

    records.forEach((r) => {
      r.parts.forEach(Object.freeze);
      Object.freeze(r.parts);
      Object.freeze(r);
    });
    Object.freeze(records);
    check(records, [query]);
    expect(records).toEqual(original);

    const lookup = plateStatusLookup(records);

    query.items = [];
    expect(lookup(query).record).toBe(records[0]);
    query.hash = 'missing';
    expect(lookup(query)).toEqual({ state: 'new', record: undefined });

    const edited = structuredClone(original);

    edited[1].parts = [{ id: 'part-1', key: 'changed' }];
    edited[0].state = 'failed';
    edited[0].sentAt = new Date(10000).toISOString();
    check(edited, [plate('hash-1', ['part-1']), plate('missing', ['part-1'])]);
    expect(plateStatusLookup()(query)).toEqual({ state: 'new', record: undefined });
  });

  it.each([100, 200])('reads %i record hashes once across every plate and repeated consumer', (count) => {
    let reads = 0;
    const records = Array.from({ length: count }, (_, id) => ({
      ...record(id),
      get hash() {
        reads++;

        return `hash-${id}`;
      },
    }));
    const queries = Array.from({ length: count }, (_, id) => plate(`absent-${id}`, [`part-${id}`]));
    const lookup = plateStatusLookup(records);

    for (const query of queries) {
      expect(lookup(query)).toEqual({ state: 'new', record: undefined });
      expect(lookup(query)).toEqual({ state: 'new', record: undefined });
    }

    expect(reads).toBe(count);
    reads = 0;

    for (const query of queries) expect(previousStatus(query, records)).toEqual(lookup(query));

    expect(reads).toBe(count * count);
  });

  it.each([100, 200])('prepares pending parts twice for %i replacement records without per-plate scans', (count) => {
    let reads = 0;
    const records = Array.from({ length: count }, (_, id) => {
      const pending = record(id, { state: 'reprint' });
      const parts = pending.parts;

      return {
        ...pending,
        get parts() {
          reads++;

          return parts;
        },
      };
    });
    const queries = Array.from({ length: count }, (_, id) => plate(`absent-${id}`, [`absent-${id}`]));
    const lookup = plateStatusLookup(records);

    for (const query of queries) expect(lookup(query)).toEqual({ state: 'new', record: undefined });

    expect(reads).toBe(count * 2);
    reads = 0;

    for (const query of queries) expect(previousStatus(query, records)).toEqual(lookup(query));

    expect(reads).toBe(count * count * 2);
  });
});
