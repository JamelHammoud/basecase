import { expect, it } from 'vitest';
import { allocatePurchases, allocatedCount } from '../../electron/backend/buildAllocations.mjs';
import { availablePrintCopies } from '../../electron/backend/printAllocations.mjs';
import type { Purchases } from '../types/robotics';
import { onHandOf } from '../utils/onHand';
import { fixtureTriangles } from '../sim/fixtures/parts';
import { weld } from '../print/threeMf';
import { shapeKey } from '../print/shapeKey';
import { printRecordFor } from '../print/tracker';
import type { Plate } from '../print/plan';
import { kitFixture } from './kit.fixtures';
import { createBuildStore } from './buildRecords';
import { memoryBuildStorage } from './buildStorage.fixtures';
import { freezeBuildKit, readFrozenKit } from './frozenKit';
import { buildDemand } from './buildDemand';

const designs = [
  'differential rover',
  'SO-101-style arm',
  'quadruped',
  'hexapod',
  'biped',
  'pan-tilt camera',
  'gripper',
  'conveyor mechanism',
  'mixed-servo arm',
  'repeated limb modules',
];

it.each(designs)('conserves stock and physical copies across one and twenty frozen %s builds', async (name) => {
  const job = kitFixture(name);
  const triangles = fixtureTriangles(job.parts);
  const meshes = Object.fromEntries(job.parts.map((part) => [part.id, weld(triangles(part.id)!)]));
  const prepared = await freezeBuildKit({ job, meshes });
  const frozen = readFrozenKit(prepared);
  const demand = buildDemand(frozen);

  expect(demand.printed.every((part) => part.qty === 1 && !part.refusal)).toBe(true);
  expect(Object.keys(frozen.productionKeys!).sort()).toEqual(frozen.manifest.printed.map((part) => part.id).sort());

  const storage = memoryBuildStorage();
  const builds = createBuildStore(storage);
  const [single] = await builds.createMany(['Single'], prepared);
  const records = await builds.createMany(
    Array.from({ length: 20 }, (_, i) => `Robot ${i + 1}`),
    prepared,
  );
  const immutable = JSON.stringify(prepared);
  const bytes = storage.assetBytes();
  const component = demand.components.find((line) => line.key.startsWith('component:')) ?? demand.components[0];
  const total = component.qty * records.length;
  let stock: Purchases = { [component.key]: { onHand: total - 1, priceUsd: 10, packQty: 10, checkedAt: '2026-11-20' } };

  for (const record of records) {
    const quantity = Math.min(component.qty, onHandOf(stock[component.key]));

    if (quantity === 0) continue;

    const request = {
      kind: 'reserve' as const,
      request: crypto.randomUUID(),
      build: record,
      demand: component,
      quantity,
    };

    stock = allocatePurchases(stock, request);
    expect(allocatePurchases(stock, request)).toEqual(stock);
  }

  expect(allocatedCount(stock[component.key]) + onHandOf(stock[component.key])).toBe(total - 1);

  const recordedUnits = stock[component.key].reservations!.reduce((sum, owner) => sum + owner.quantity, 0);

  expect(recordedUnits).toBe(total - 1);
  expect(allocatedCount(stock[component.key])).toBe(recordedUnits);
  expect(total - allocatedCount(stock[component.key])).toBe(1);
  expect(() =>
    allocatePurchases(stock, {
      kind: 'reserve',
      request: crypto.randomUUID(),
      build: single,
      demand: component,
      quantity: 1,
    }),
  ).toThrow();
  expect(
    stock[component.key].reservations!.every((entry) => JSON.stringify(entry.demand) === JSON.stringify(component)),
  ).toBe(true);

  const printed = demand.printed[0];
  const output = printRecordFor(
    {
      number: 1,
      material: printed.material,
      hash: 'declared-production-output',
      items: Array.from({ length: printed.qty * records.length }, (_, copy) => ({ id: printed.partId, copy })),
    } as Plate,
    {
      parts: frozen.parts,
      keyOf: shapeKey,
      sourceKeys: frozen.productionKeys,
      labels: demand.printed[0].labels,
      printer: 'Generated fixture',
      now: new Date('2026-11-20T10:00:00Z'),
    },
  );

  stock = allocatePurchases(stock, {
    kind: 'print',
    record: { ...output, state: 'printed', completion: { enteredAt: '2026-11-20T11:00:00Z' } },
  });

  expect(availablePrintCopies(stock, printed)).toHaveLength(printed.qty * records.length);
  expect(availablePrintCopies(stock, { ...printed, key: 'changed' })).toEqual([]);
  expect(availablePrintCopies(stock, { ...printed, material: 'changed' })).toEqual([]);

  for (const build of records) {
    for (let i = 0; i < printed.qty; i++) {
      const available = availablePrintCopies(stock, printed)[0];

      stock = allocatePurchases(stock, {
        kind: 'assign',
        request: crypto.randomUUID(),
        build,
        demand: printed,
        key: available.key,
        copy: available.copy.id,
      });
    }
  }

  const retained = JSON.parse(JSON.stringify(stock)) as Purchases;
  const copies = Object.values(retained[`print:${output.id}`].printOutput!.assignments).flat();

  expect(copies).toHaveLength(printed.qty * records.length);
  expect(new Set(copies.map((assignment) => assignment.build.id)).size).toBe(20);
  expect(availablePrintCopies(retained, printed)).toEqual([]);
  expect(availablePrintCopies(retained, { ...printed, key: 'changed' })).toEqual([]);
  expect(availablePrintCopies(retained, { ...printed, material: 'changed' })).toEqual([]);

  const assignedBefore = allocatedCount(retained[component.key]);

  retained[component.key] = { ...retained[component.key], onHand: 0 };
  expect(allocatedCount(retained[component.key])).toBe(assignedBefore);
  expect(onHandOf(retained[component.key])).toBe(0);

  const unresolvedUnits = recordedUnits;

  expect((retained[component.key].onHand ?? 0) + unresolvedUnits).toBe(
    recordedUnits + onHandOf(retained[component.key]),
  );
  await builds.complete(records[0].id, 0, true);
  await builds.remove(records[0].id);
  expect(allocatedCount(retained[component.key])).toBe(assignedBefore);
  expect(Object.values(retained[`print:${output.id}`].printOutput!.assignments).flat()).toEqual(copies);
  expect(storage.assetBytes()).toBe(bytes);
  expect(JSON.stringify(prepared)).toBe(immutable);
  expect((await builds.open(single.id)).record).toEqual(single);
});
