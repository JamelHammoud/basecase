import { expect, it } from 'vitest';
import { allocatePurchases, allocatedCount } from '../../electron/backend/buildAllocations.mjs';
import { availablePrintCopies } from '../../electron/backend/printAllocations.mjs';
import { printRecordFor } from '../print/tracker';
import { shapeKey } from '../print/shapeKey';
import type { Plate } from '../print/plan';
import type { Purchases } from '../types/robotics';
import { buildDemand } from './buildDemand';
import { repairDemand, repairOwner } from './buildRepairDemand';
import { createBuildStore } from './buildRecords';
import { memoryBuildStorage } from './buildStorage.fixtures';
import { repairKitFixture, repairDesigns } from './buildRepair.fixtures';

function printedStock(fixture: Awaited<ReturnType<typeof repairKitFixture>>, count: number) {
  const part = buildDemand(fixture.kit).printed.find((item) => item.partId === 'service-plate')!;
  const plate = {
    number: 1,
    hash: fixture.content.hash,
    material: part.material,
    items: Array.from({ length: count }, (_, copy) => ({ id: part.partId, copy })),
  } as Plate;
  const record = printRecordFor(plate, {
    parts: fixture.kit.parts,
    sourceKeys: fixture.kit.productionKeys,
    keyOf: shapeKey,
    labels: '',
    printer: 'Generated fixture',
    now: new Date('2026-11-20T12:00:00Z'),
  });

  return { part, record: { ...record, state: 'printed' as const } };
}

it.each(repairDesigns)(
  'repairs one of one and twenty retained %s builds while independently conserving stock and copies',
  async (name) => {
    const source = await repairKitFixture(name);
    const target = await repairKitFixture(name, 'geometry');
    const immutable = JSON.stringify(source.content);
    const storage = memoryBuildStorage();
    const builds = createBuildStore(storage);
    const single = await builds.createMany(['Single'], source.content);
    const batch = await builds.createMany(
      Array.from({ length: 20 }, (_, index) => `Robot ${index + 1}`),
      source.content,
    );
    const records = [...single, ...batch];
    const component = buildDemand(source.kit).components[0];
    const originalCopies = printedStock(source, 21);
    const replacementCopies = printedStock(target, 2);
    let purchases: Purchases = { [component.key]: { onHand: component.qty * records.length } };

    purchases = allocatePurchases(purchases, { kind: 'print', record: originalCopies.record });
    purchases = allocatePurchases(purchases, { kind: 'print', record: replacementCopies.record });

    for (const record of records) {
      purchases = allocatePurchases(purchases, {
        kind: 'reserve',
        request: crypto.randomUUID(),
        build: record,
        demand: component,
        quantity: component.qty,
      });

      const copy = availablePrintCopies(purchases, originalCopies.part)[0];

      purchases = allocatePurchases(purchases, {
        kind: 'assign',
        request: crypto.randomUUID(),
        build: record,
        demand: originalCopies.part,
        key: copy.key,
        copy: copy.copy.id,
      });
      await builds.complete(record.id, 0, true);
    }

    const independent = await Promise.all(batch.slice(1).map((record) => builds.open(record.id)));

    for (const selected of [single[0], batch[0]]) {
      const heldBefore = JSON.stringify(purchases);
      const started = await builds.startRepair({
        id: selected.id,
        target: target.content,
        request: crypto.randomUUID(),
        signal: new AbortController().signal,
      });
      const repair = started.repairs!.at(-1)!;

      expect(JSON.stringify(purchases)).toBe(heldBefore);
      expect(repair.source).toBe(source.content.hash);
      expect(repair.target).toBe(target.content.hash);
      expect(repair.count).toBeGreaterThan(0);
      expect(repair.affected).toEqual(['service-plate']);
      await builds.repairAction({ id: selected.id, repair: repair.id, step: 0, complete: true });
      await builds.cancelRepair(selected.id, repair.id);
      expect(JSON.stringify(purchases)).toBe(heldBefore);
      await builds.resumeRepair(selected.id, repair.id);

      const restarted = createBuildStore(storage);
      const demand = repairDemand(target.kit, repair).printed[0];
      const copy = availablePrintCopies(purchases, demand)[0];
      const owner = repairOwner(started, repair);
      const assignment = {
        kind: 'assign' as const,
        request: crypto.randomUUID(),
        build: owner,
        demand,
        key: copy.key,
        copy: copy.copy.id,
      };

      purchases = allocatePurchases(purchases, assignment);
      expect(allocatePurchases(purchases, assignment)).toEqual(purchases);
      expect(() => allocatePurchases(purchases, { ...assignment, request: crypto.randomUUID() })).toThrow();

      for (let step = 1; step < repair.count; step++)
        await restarted.repairAction({ id: selected.id, repair: repair.id, step, complete: true });

      await restarted.stageRepair(selected.id, repair.id);
      storage.interrupt();
      await expect(restarted.finishRepair({ id: selected.id, repair: repair.id, purchases })).rejects.toThrow(
        'Interrupted',
      );
      expect((await restarted.open(selected.id)).record.configuration).toBeUndefined();

      const ownership = JSON.stringify(purchases);
      const completed = await restarted.finishRepair({ id: selected.id, repair: repair.id, purchases });

      expect(completed.kit).toBe(source.content.hash);
      expect(completed.configuration).toBe(target.content.hash);
      expect(JSON.stringify(purchases)).toBe(ownership);
      expect(await restarted.finishRepair({ id: selected.id, repair: repair.id, purchases })).toEqual(completed);
      expect((await restarted.open(selected.id)).kit.geometry).toEqual(target.kit.geometry);

      const originalOutput = purchases[`print:${originalCopies.record.id}`].printOutput!;
      const originalCopy = Object.entries(originalOutput.assignments).find(([, history]) =>
        history.some((item) => !item.returnedAt && item.build.id === selected.id),
      )![0];

      purchases = allocatePurchases(purchases, {
        kind: 'return-copy',
        request: crypto.randomUUID(),
        build: selected,
        demand: originalCopies.part,
        key: `print:${originalCopies.record.id}`,
        copy: originalCopy,
      });
      expect(availablePrintCopies(purchases, originalCopies.part)).toHaveLength(selected === single[0] ? 1 : 2);
    }

    const sourceHeld = Object.values(purchases[`print:${originalCopies.record.id}`].printOutput!.assignments)
      .flat()
      .filter((item) => !item.returnedAt);
    const targetHeld = Object.values(purchases[`print:${replacementCopies.record.id}`].printOutput!.assignments)
      .flat()
      .filter((item) => !item.returnedAt);

    expect(sourceHeld).toHaveLength(19);
    expect(targetHeld).toHaveLength(2);
    expect(availablePrintCopies(purchases, originalCopies.part).length + sourceHeld.length).toBe(21);
    expect(availablePrintCopies(purchases, replacementCopies.part).length + targetHeld.length).toBe(2);
    expect(purchases[component.key].reservations!.reduce((sum, item) => sum + item.quantity, 0)).toBe(
      component.qty * 21,
    );
    expect(allocatedCount(purchases[component.key])).toBe(component.qty * 21);
    expect(await Promise.all(batch.slice(1).map((record) => builds.open(record.id)))).toEqual(independent);
    expect(JSON.stringify(source.content)).toBe(immutable);
  },
);
