import { expect, it } from 'vitest';
import { kitFixture } from '../kit/kit.fixtures';
import { printRecordFor, markForReprint, plateStatusLookup } from './tracker';
import { shapeKey } from './shapeKey';
import { reconcileCopies } from './productionCopies';
import { allocatePurchases } from '../../electron/backend/buildAllocations.mjs';
import { availablePrintCopies } from '../../electron/backend/printAllocations.mjs';

it('retains every planned copy on shared plates and distinct identities for repeated attempts', () => {
  const job = kitFixture('repeated limb modules');
  const plate = job.print.plan.plates.find(
    (item) => new Set(item.items.map((copy) => copy.id)).size < item.items.length,
  )!;
  const context = { parts: job.parts, keyOf: shapeKey, printer: 'Fixture', now: new Date('2026-11-20T10:00:00Z') };
  const first = printRecordFor(plate, context);
  const second = printRecordFor(plate, context);

  expect(first.copies).toHaveLength(plate.items.length);
  expect(new Set(first.copies!.map((copy) => copy.id)).size).toBe(plate.items.length);
  expect(first.copies!.map((copy) => [copy.partId, copy.index])).toEqual(
    plate.items.map((copy) => [copy.id, copy.copy]),
  );
  expect(first.parts).toHaveLength(new Set(plate.items.map((copy) => copy.id)).size);
  expect(first.id).not.toBe(second.id);
  expect(second.copies!.some((copy) => first.copies!.some((original) => original.id === copy.id))).toBe(false);
  expect(first.material).toBe(plate.material);
  expect(first.hash).toBe(plate.hash);
});

it('requires explicit quantities for a legacy shared plate without changing its entered evidence', () => {
  const job = kitFixture('differential rover');
  const planned = printRecordFor(job.print.plan.plates[0], {
    parts: job.parts,
    keyOf: shapeKey,
    printer: 'Fixture',
    now: new Date('2026-11-20T10:00:00Z'),
  });
  const legacy = {
    ...planned,
    copies: undefined,
    state: 'printed' as const,
    completion: { enteredAt: '2026-11-20T11:00:00Z' },
  };
  const before = JSON.stringify(legacy);
  const empty = allocatePurchases({}, { kind: 'print', record: legacy });
  const quantities = Object.fromEntries(legacy.parts.map((part, index) => [part.id, index + 1]));
  const reconciled = reconcileCopies(legacy, quantities);
  const stock = allocatePurchases(empty, { kind: 'print', record: reconciled });

  expect(availablePrintCopies(empty)).toEqual([]);
  expect(availablePrintCopies(stock)).toHaveLength(
    Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0),
  );
  expect(reconciled.completion).toEqual(legacy.completion);
  expect(reconciled.parts).toEqual(legacy.parts);
  expect(reconciled.sentAt).toBe(legacy.sentAt);
  expect(JSON.stringify(legacy)).toBe(before);
  expect(() => reconcileCopies(legacy, {})).toThrow();
  expect(() => reconcileCopies(legacy, { ...quantities, [legacy.parts[0].id]: 0 })).toThrow();
  expect(() => reconcileCopies(reconciled, quantities)).toThrow();
});

it('keeps old geometry evidence but withholds unassigned copies while reprinting that source', () => {
  const job = kitFixture('differential rover');
  const record = {
    ...printRecordFor(job.print.plan.plates[0], {
      parts: job.parts,
      keyOf: shapeKey,
      printer: 'Fixture',
      now: new Date('2026-11-20T10:00:00Z'),
    }),
    state: 'printed' as const,
  };
  const part = record.parts[0];
  const pending = markForReprint([record], part.id, new Date('2026-11-20T11:00:00Z'))[0];
  const old = allocatePurchases({}, { kind: 'print', record });
  const stock = allocatePurchases(old, { kind: 'print', record: pending });

  expect(pending.copies).toBeUndefined();
  expect(availablePrintCopies(stock).some((entry) => entry.copy.partId === part.id)).toBe(false);
  expect(stock[`print:${record.id}`].printOutput!.record).toMatchObject(record);
  expect(old[`print:${record.id}`].printOutput!.record.parts).toEqual(record.parts);
});

it('keeps separately numbered plates independent even when their manufacturing content hashes match', () => {
  const job = kitFixture('differential rover');
  const first = job.print.plan.plates[0];
  const second = { ...first, number: first.number + 1 };
  const context = { parts: job.parts, keyOf: shapeKey, printer: 'Fixture', now: new Date('2026-11-20T10:00:00Z') };
  const record = { ...printRecordFor(first, context), state: 'printed' as const };
  const before = plateStatusLookup([record]);

  expect(before(first).state).toBe('printed');
  expect(before(second).state).toBe('new');

  const other = { ...printRecordFor(second, context), state: 'printed' as const };
  const after = plateStatusLookup([record, other]);

  expect(after(first).record?.id).toBe(record.id);
  expect(after(second).record?.id).toBe(other.id);
  expect(new Set([...record.copies!, ...other.copies!].map((copy) => copy.id)).size).toBe(first.items.length * 2);
});
