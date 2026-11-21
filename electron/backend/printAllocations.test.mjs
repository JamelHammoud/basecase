import { expect, it } from 'vitest';
import { allocatePurchases } from './buildAllocations.mjs';

const build = { id: 'robot-one', name: 'Robot one', kit: 'a'.repeat(64) };
const demand = { partId: 'chassis', key: 'shape-one', material: 'PLA', qty: 1 };
const record = {
  id: 'attempt-one',
  plate: 1,
  hash: 'manufacturing-one',
  material: 'PLA',
  printer: 'Fixture',
  sentAt: '2026-11-20T10:00:00Z',
  state: 'printed',
  parts: [{ id: 'chassis', key: 'shape-one' }],
  copies: [
    { id: 'copy-one', partId: 'chassis', key: 'shape-one', index: 0 },
    { id: 'copy-two', partId: 'chassis', key: 'shape-one', index: 1 },
  ],
  completion: { enteredAt: '2026-11-20T10:01:00Z' },
};
const printed = () => allocatePurchases({}, { kind: 'print', record });
const assign = (copy, owner = build) => ({
  kind: 'assign',
  request: `assign-${owner.id}-${copy}`,
  key: 'print:attempt-one',
  copy,
  build: owner,
  demand,
});

it('assigns two physical copies once each and recovers independent ownership', () => {
  const first = allocatePurchases(printed(), assign('copy-one'));
  const second = allocatePurchases(first, assign('copy-two', { ...build, id: 'robot-two' }));
  const restored = JSON.parse(JSON.stringify(second));

  expect(restored['print:attempt-one'].printOutput.assignments['copy-one'][0].build.id).toBe('robot-one');
  expect(restored['print:attempt-one'].printOutput.assignments['copy-two'][0].build.id).toBe('robot-two');
  expect(allocatePurchases(restored, assign('copy-one'))).toEqual(restored);
  expect(() => allocatePurchases(restored, assign('copy-one', { ...build, id: 'robot-three' }))).toThrow();
  expect(() => allocatePurchases(first, assign('copy-two'))).toThrow('demand');
});

it.each(['sent', 'printing', 'failed', 'cancelled', 'reprint'])('refuses copies from %s records', (state) => {
  const stock = allocatePurchases({}, { kind: 'print', record: { ...record, state } });

  expect(() => allocatePurchases(stock, assign('copy-one'))).toThrow();
});

it('requires explicit legacy quantities and rejects incompatible source or material', () => {
  const stock = allocatePurchases({}, { kind: 'print', record: { ...record, copies: undefined } });

  expect(() => allocatePurchases(stock, assign('copy-one'))).toThrow();
  expect(() =>
    allocatePurchases(printed(), { ...assign('copy-one'), demand: { ...demand, key: 'changed' } }),
  ).toThrow();
  expect(() =>
    allocatePurchases(printed(), { ...assign('copy-one'), demand: { ...demand, material: 'PETG' } }),
  ).toThrow();
});

it('keeps ownership through reprint requests and allows explicit return and reassignment', () => {
  const held = allocatePurchases(printed(), assign('copy-one'));
  const returned = allocatePurchases(held, { ...assign('copy-one'), kind: 'return-copy', request: 'returned' });
  const next = allocatePurchases(returned, assign('copy-one', { ...build, id: 'robot-two' }));

  expect(next['print:attempt-one'].printOutput.assignments['copy-one']).toHaveLength(2);
  expect(next['print:attempt-one'].printOutput.assignments['copy-one'][0].returnedAt).toEqual(expect.any(String));

  const pending = allocatePurchases(held, {
    kind: 'print',
    record: {
      ...record,
      id: 'reprint-request',
      hash: 'reprint-request',
      state: 'reprint',
      copies: undefined,
      sentAt: '2026-11-20T11:00:00Z',
    },
  });

  expect(pending['print:attempt-one'].printOutput.assignments['copy-one']).toHaveLength(1);

  const assigned = Object.values(pending['print:attempt-one'].printOutput.assignments)
    .flat()
    .filter((owner) => !owner.returnedAt).length;

  expect(pending['print:attempt-one'].printOutput.record.copies).toHaveLength(assigned + 1);
  expect(() => allocatePurchases(pending, assign('copy-two', { ...build, id: 'robot-two' }))).toThrow();
  expect(pending['print:attempt-one'].printOutput.record.completion).toEqual(record.completion);
});

it('refuses a physical copy identity reused by another attempt without changing its owner', () => {
  const stock = allocatePurchases(printed(), assign('copy-one'));
  const before = JSON.stringify(stock);

  expect(() => allocatePurchases(stock, { kind: 'print', record: { ...record, id: 'cloned-attempt' } })).toThrow(
    'source',
  );
  expect(JSON.stringify(stock)).toBe(before);
  expect(allocatePurchases(stock, { kind: 'print', record })).toEqual(stock);
});

it('binds compatible copy allocation to the declared guide-letter manufacturing revision', () => {
  const output = { ...record, revision: JSON.stringify([record.hash, 'guide-one']) };
  const stock = allocatePurchases({}, { kind: 'print', record: output });
  const matching = { ...assign('copy-one'), demand: { ...demand, labels: 'guide-one' } };

  expect(() => allocatePurchases(stock, { ...matching, demand: { ...matching.demand, labels: 'guide-two' } })).toThrow(
    'frozen part',
  );
  expect(() => allocatePurchases(stock, matching)).not.toThrow();
  expect(() =>
    allocatePurchases(stock, {
      kind: 'print',
      record: { ...output, revision: JSON.stringify([record.hash, 'guide-two']) },
    }),
  ).toThrow('source');
});

it('permits the final copy return after reaching the assignment-history bound', () => {
  const held = allocatePurchases(printed(), assign('copy-one'));
  const active = held['print:attempt-one'].printOutput.assignments['copy-one'][0];
  const history = Array.from({ length: 999 }, (_, index) => ({
    ...active,
    request: `old-${index}`,
    returnedAt: record.sentAt,
  }));

  held['print:attempt-one'].printOutput.assignments['copy-one'] = [...history, active];

  const returned = allocatePurchases(held, { ...assign('copy-one'), kind: 'return-copy', request: 'last-return' });

  expect(returned['print:attempt-one'].printOutput.assignments['copy-one']).toHaveLength(1000);
  expect(returned['print:attempt-one'].printOutput.assignments['copy-one'].every((owner) => owner.returnedAt)).toBe(
    true,
  );
});

it('refuses copies outside the declared source parts even when another source signature is supplied', () => {
  const undeclared = { id: 'unmapped-copy', partId: 'other-part', key: 'other-shape', index: 0 };
  const input = { ...record, sourceKeys: { 'other-part': 'other-shape' }, copies: [...record.copies, undeclared] };

  expect(() => allocatePurchases({}, { kind: 'print', record: input })).toThrow('Reconcile');
});

it('recovers a committed entered attempt after acknowledgment is lost without creating new copies', () => {
  const entered = { ...record, sceneId: 'scene-one', sourceKeys: { chassis: 'shape-one', other: 'original-other' } };
  const original = allocatePurchases({}, { kind: 'print', record: entered });
  const held = allocatePurchases(original, assign('copy-one'));
  const repeated = {
    ...entered,
    id: 'unacknowledged-retry',
    sentAt: '2026-11-20T10:05:00Z',
    copies: entered.copies.map((copy) => ({ ...copy, id: `retry-${copy.id}` })),
    sourceKeys: { chassis: 'shape-one', other: 'changed-unprinted-source' },
  };
  const recovered = allocatePurchases(held, { kind: 'print', record: repeated });

  expect(Object.keys(recovered)).toEqual(Object.keys(held));
  expect(recovered['print:attempt-one'].printOutput.record).toEqual(held['print:attempt-one'].printOutput.record);
  expect(recovered['print:attempt-one'].printOutput.assignments).toEqual(
    held['print:attempt-one'].printOutput.assignments,
  );
});

it('starts a new recoverable entered attempt only after an explicit replacement cycle', () => {
  const entered = { ...record, sceneId: 'scene-one', sourceKeys: { chassis: 'shape-one', other: 'original-other' } };
  let stock = allocatePurchases({}, { kind: 'print', record: entered });

  stock = allocatePurchases(stock, {
    kind: 'print',
    record: {
      ...entered,
      id: 'replacement',
      hash: 'replacement',
      state: 'reprint',
      copies: undefined,
      completion: undefined,
      sentAt: '2026-11-20T11:00:00Z',
    },
  });

  const next = {
    ...entered,
    id: 'attempt-two',
    sentAt: '2026-11-20T11:01:00Z',
    copies: entered.copies.map((copy) => ({ ...copy, id: `new-${copy.id}` })),
  };

  stock = allocatePurchases(stock, { kind: 'print', record: next });

  const recovered = allocatePurchases(stock, {
    kind: 'print',
    record: { ...next, id: 'retry-two', copies: next.copies.map((copy) => ({ ...copy, id: `retry-${copy.id}` })) },
  });

  expect(Object.keys(recovered)).toHaveLength(3);
  expect(recovered['print:attempt-two'].printOutput.record.cycle).toBe('replacement');
  expect(recovered['print:attempt-one'].printOutput.record.copies).toEqual(entered.copies);
});

it('recovers an entered failed status against the retained attempt after the scene lost its acknowledgment', () => {
  const entered = { ...record, sceneId: 'scene-one', origin: 'entered' };
  const stock = allocatePurchases({}, { kind: 'print', record: entered });
  const recovered = allocatePurchases(stock, {
    kind: 'print',
    record: {
      ...entered,
      id: 'failed-retry',
      state: 'failed',
      completion: undefined,
      copies: entered.copies.map((copy) => ({ ...copy, id: `retry-${copy.id}` })),
    },
  });

  expect(Object.keys(recovered)).toHaveLength(1);
  expect(recovered['print:attempt-one'].printOutput.record.state).toBe('failed');
  expect(recovered['print:attempt-one'].printOutput.record.completion).toEqual(record.completion);
});
