import { expect, it } from 'vitest';
import { allocatePurchases } from '../../electron/backend/buildAllocations.mjs';
import { availablePrintCopies } from '../../electron/backend/printAllocations.mjs';
import { fixtureTriangles } from '../sim/fixtures/parts';
import { printRecordFor } from '../print/tracker';
import { shapeKey } from '../print/shapeKey';
import { weld } from '../print/threeMf';
import { isPrinted } from '../utils/bom';
import type { Purchases, ScenePart } from '../types/robotics';
import { buildDemand } from './buildDemand';
import { createBuildStore } from './buildRecords';
import { memoryBuildStorage } from './buildStorage.fixtures';
import { freezeBuildKit, readFrozenKit } from './frozenKit';
import { kitFixture } from './kit.fixtures';

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

async function prepared(name: string, revise: (part: ScenePart) => ScenePart = (part) => part) {
  const job = kitFixture(name, (parts) => {
    const target = parts.find(isPrinted)!.id;

    return parts.map((part) => (part.id === target ? revise({ ...part, print: { ...part.print, copies: 2 } }) : part));
  });

  job.project = { ...job.project, labelParts: false };

  const triangles = fixtureTriangles(job.parts);
  const meshes = Object.fromEntries(job.parts.map((part) => [part.id, weld(triangles(part.id)!)]));
  const content = await freezeBuildKit({ job, meshes });

  return { job, content, frozen: readFrozenKit(content) };
}

it.each(designs)('keeps old %s ownership while compatible and incompatible Kits coexist', async (name) => {
  const old = await prepared(name);
  const compatible = await prepared(name, (part) => ({ ...part, name: `${part.name} renamed`, color: '#222222' }));
  const geometry = await prepared(name, (part) => ({
    ...part,
    dimensions: { ...part.dimensions, width: part.dimensions.width + 1 },
  }));
  const material = await prepared(name, (part) => ({ ...part, printMaterial: 'PETG' }));
  const demandOf = (kit: typeof old) =>
    buildDemand(kit.frozen).printed.find((part) => part.partId === kit.job.parts.find(isPrinted)!.id)!;
  const demand = demandOf(old);

  expect(demandOf(compatible).key).toBe(demand.key);
  expect(demandOf(geometry).key).not.toBe(demand.key);
  expect(demandOf(material).material).not.toBe(demand.material);
  expect(compatible.content.hash).not.toBe(old.content.hash);

  const storage = memoryBuildStorage();
  const builds = createBuildStore(storage);
  const original = await builds.create('Original', old.content);
  const next = await builds.create('Compatible', compatible.content);
  const changed = await builds.create('Changed', geometry.content);
  const immutable = JSON.stringify(old.content);
  let stock: Purchases = {};

  for (const plate of old.job.print.plan.plates) {
    const record = printRecordFor(plate, {
      parts: old.frozen.parts,
      sourceKeys: old.frozen.productionKeys,
      keyOf: shapeKey,
      labels: '',
      printer: 'Generated fixture',
      now: new Date('2026-11-20T10:00:00Z'),
    });

    stock = allocatePurchases(stock, { kind: 'print', record: { ...record, state: 'printed' } });
  }

  const assign = (build: typeof original, requested = demand) => {
    const copy = availablePrintCopies(stock, demand)[0];

    return allocatePurchases(stock, {
      kind: 'assign',
      request: crypto.randomUUID(),
      build,
      demand: requested,
      key: copy.key,
      copy: copy.copy.id,
    });
  };

  expect(availablePrintCopies(stock, demand)).toHaveLength(2);
  stock = assign(original);

  const owned = JSON.stringify(stock);

  expect(() => assign(changed, demandOf(geometry))).toThrow('frozen part');
  expect(() => assign(changed, demandOf(material))).toThrow('frozen part');
  expect(availablePrintCopies(stock, { ...demand, partId: `${demand.partId}-merged` })).toEqual([]);
  expect(JSON.stringify(stock)).toBe(owned);
  stock = assign(next, demandOf(compatible));
  expect(availablePrintCopies(stock, demand)).toEqual([]);
  expect((await builds.open(original.id)).record).toEqual(original);
  expect((await builds.open(changed.id)).kit.productionKeys).toEqual(geometry.frozen.productionKeys);
  expect(JSON.stringify(old.content)).toBe(immutable);
});
