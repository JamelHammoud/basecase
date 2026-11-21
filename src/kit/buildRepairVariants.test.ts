import { expect, it } from 'vitest';
import { allocatePurchases, allocatedCount } from '../../electron/backend/buildAllocations.mjs';
import { createBuildStore } from './buildRecords';
import { memoryBuildStorage } from './buildStorage.fixtures';
import { repairKitFixture, repairDesigns } from './buildRepair.fixtures';
import { buildDemand } from './buildDemand';
import { repairDemand, repairOwner } from './buildRepairDemand';
import type { Purchases } from '../types/robotics';

it.each(repairDesigns)(
  'records a catalog variant replacement and wiring work for retained %s identity',
  async (name) => {
    const source = await repairKitFixture(name);
    const target = await repairKitFixture(name, 'variant');
    const builds = createBuildStore(memoryBuildStorage());
    const original = await builds.create('Robot', source.content);
    const started = await builds.startRepair({
      id: original.id,
      target: target.content,
      request: crypto.randomUUID(),
      signal: new AbortController().signal,
    });
    const repair = started.repairs!.at(-1)!;
    const oldDemand = buildDemand(source.kit).components.find((line) => line.partIds.includes('service-servo'))!;
    const replacement = repairDemand(target.kit, repair).components[0];

    expect(repair.affected).toEqual(['service-servo']);
    expect(replacement.key).not.toBe(oldDemand.key);
    expect(replacement.qty).toBe(1);
    expect(repair.plan.declarations.some((action) => action.kind === 'disconnect')).toBe(true);
    expect(repair.plan.declarations.some((action) => action.kind === 'connect')).toBe(true);

    let purchases: Purchases = { [oldDemand.key]: { onHand: oldDemand.qty }, [replacement.key]: { onHand: 1 } };

    purchases = allocatePurchases(purchases, {
      kind: 'reserve',
      request: crypto.randomUUID(),
      build: original,
      demand: oldDemand,
      quantity: oldDemand.qty,
    });
    purchases = allocatePurchases(purchases, {
      kind: 'reserve',
      request: crypto.randomUUID(),
      build: repairOwner(started, repair),
      demand: replacement,
      quantity: 1,
    });

    for (let step = 0; step < repair.count; step++)
      await builds.repairAction({ id: original.id, repair: repair.id, step, complete: true });

    await builds.stageRepair(original.id, repair.id);
    await builds.finishRepair({ id: original.id, repair: repair.id, purchases });
    expect(allocatedCount(purchases[oldDemand.key])).toBe(oldDemand.qty);
    expect(allocatedCount(purchases[replacement.key])).toBe(1);
    purchases = allocatePurchases(purchases, {
      kind: 'return',
      request: crypto.randomUUID(),
      build: original,
      demand: oldDemand,
      quantity: 1,
    });
    expect(allocatedCount(purchases[oldDemand.key])).toBe(oldDemand.qty - 1);
    expect(allocatedCount(purchases[replacement.key])).toBe(1);

    const next = await repairKitFixture(name, 'wiring');
    const wireBuild = await builds.create('Wiring', source.content);
    const rerouted = await builds.startRepair({
      id: wireBuild.id,
      target: next.content,
      request: crypto.randomUUID(),
      signal: new AbortController().signal,
    });
    const wiring = rerouted.repairs!.at(-1)!;

    expect(wiring.plan.comparison.wiring).toBe(true);
    expect(wiring.plan.declarations.length).toBeGreaterThan(0);
    expect(wiring.affected).toEqual([]);

    const cables = repairDemand(next.kit, wiring).components;

    expect(cables.some((line) => line.key === 'supply:waveshare-servo-cable-5264-900')).toBe(true);

    const repeatedStock = structuredClone(next.kit);
    const cableLine = repeatedStock.manifest.purchases.find(
      (line) => line.key === 'supply:waveshare-servo-cable-5264-900',
    )!;

    cableLine.qty += 10;
    expect(repairDemand(repeatedStock, wiring).components).toEqual(cables);

    let cableStock: Purchases = {};

    for (const line of cables) {
      cableStock = { ...cableStock, [line.key]: { onHand: line.qty } };
      cableStock = allocatePurchases(cableStock, {
        kind: 'reserve',
        request: crypto.randomUUID(),
        build: repairOwner(rerouted, wiring),
        demand: line,
        quantity: line.qty,
      });
    }

    for (let step = 0; step < wiring.count; step++)
      await builds.repairAction({ id: wireBuild.id, repair: wiring.id, step, complete: true });

    await builds.stageRepair(wireBuild.id, wiring.id);

    const heldCables = JSON.stringify(cableStock);

    expect(
      (await builds.finishRepair({ id: wireBuild.id, repair: wiring.id, purchases: cableStock })).configuration,
    ).toBe(next.content.hash);
    expect(JSON.stringify(cableStock)).toBe(heldCables);
  },
);

it('retains presentation-only changes without requiring a physical replacement', async () => {
  const source = await repairKitFixture();
  const target = await repairKitFixture(undefined, 'presentation');
  const builds = createBuildStore(memoryBuildStorage());
  const original = await builds.create('Original', source.content);
  const started = await builds.startRepair({
    id: original.id,
    target: target.content,
    request: crypto.randomUUID(),
    signal: new AbortController().signal,
  });
  const repair = started.repairs!.at(-1)!;

  expect(repair.affected).toEqual([]);
  expect(repair.count).toBe(0);
  await builds.stageRepair(original.id, repair.id);
  expect((await builds.finishRepair({ id: original.id, repair: repair.id, purchases: {} })).configuration).toBe(
    target.content.hash,
  );
});
